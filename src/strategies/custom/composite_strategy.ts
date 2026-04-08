import { BaseStrategy } from '../strategy_interface';
import { Signal, MarketData, OrderRequest } from '../../types';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Composite Strategy — Assembled from modular config blocks
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   This strategy reads its entire behavior from the config object
   passed at initialize(). Users design strategies in the UI by
   picking triggers, filters, sizing, exits, and risk controls.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ── Config shape ─────────────────────────────────────────────── */

export interface TriggerConfig {
  type: 'ema_crossover' | 'rsi_extreme' | 'price_threshold' | 'volume_spike'
    | 'probability_band' | 'mean_reversion' | 'momentum_breakout';
  params: Record<string, number | boolean | string>;
}

export interface FilterConfig {
  minLiquidity?: number;
  maxSpreadBps?: number;
  min24hVolume?: number;
  categories?: string[];
  minDaysToResolution?: number;
  maxDaysToResolution?: number;
  priceFloor?: number;
  priceCeiling?: number;
  binaryOnly?: boolean;
}

export interface SizingConfig {
  mode: 'fixed' | 'percent_of_capital' | 'kelly' | 'confidence_scaled' | 'liquidity_aware';
  fixedAmount?: number;
  positionSizePct?: number;
  kellyFraction?: number;
  baseSize?: number;
  confidenceMultiplier?: number;
  maxLiquidityPct?: number;
}

export interface ExitConfig {
  takeProfitBps?: number;
  stopLossBps?: number;
  trailingActivationBps?: number;
  trailingDistanceBps?: number;
  maxHoldMinutes?: number;
  exitAtPrice?: number;
  indicatorExit?: boolean;
}

export interface RiskConfig {
  maxOpenPositions?: number;
  maxTotalExposure?: number;
  maxPerMarket?: number;
  cooldownSeconds?: number;
  maxDailyLossPct?: number;
  maxDrawdownPct?: number;
}

export interface CompositeConfig {
  triggers: TriggerConfig[];
  triggerLogic?: 'AND' | 'OR';
  filters: FilterConfig;
  sizing: SizingConfig;
  exits: ExitConfig;
  risk: RiskConfig;
}

/* ── Internal position tracking ───────────────────────────────── */

interface CompositePosition {
  marketId: string;
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  entryPrice: number;
  size: number;
  entryTime: number;
  peakBps: number;
}

/* ── Helper: compute EMA series ───────────────────────────────── */
function computeEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  ema.push(sum / period);
  for (let i = period; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

/* ── Helper: compute RSI ──────────────────────────────────────── */
function computeRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/* ── Helper: z-score ──────────────────────────────────────────── */
function zScore(values: number[]): number {
  if (values.length < 3) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  if (variance === 0) return 0;
  return (values[values.length - 1] - mean) / Math.sqrt(variance);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Strategy Implementation
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export class CompositeStrategy extends BaseStrategy {
  readonly name = 'custom_composite';

  private cfg!: CompositeConfig;
  private priceHistory = new Map<string, number[]>();
  private volumeHistory = new Map<string, number[]>();
  private positions: CompositePosition[] = [];
  private dailyLoss = 0;
  private dailyLossResetTime = 0;

  override initialize(context: { wallet: any; config: Record<string, unknown> }): void {
    super.initialize(context);
    this.cfg = context.config as unknown as CompositeConfig;
    this.cooldownMs = (this.cfg.risk?.cooldownSeconds ?? 60) * 1000;
  }

  override onMarketUpdate(data: MarketData): void {
    super.onMarketUpdate(data);
    const prices = this.priceHistory.get(data.marketId) ?? [];
    prices.push(data.midPrice);
    if (prices.length > 100) prices.shift();
    this.priceHistory.set(data.marketId, prices);

    const vols = this.volumeHistory.get(data.marketId) ?? [];
    vols.push(data.volume24h);
    if (vols.length > 30) vols.shift();
    this.volumeHistory.set(data.marketId, vols);
  }

  protected override onMarketEvicted(marketId: string): void {
    this.priceHistory.delete(marketId);
    this.volumeHistory.delete(marketId);
  }

  /* ── Signal Generation ──────────────────────────────────────── */
  generateSignals(): Signal[] {
    const maxPos = this.cfg.risk?.maxOpenPositions ?? 8;
    if (this.positions.length >= maxPos) return [];

    // Daily loss circuit breaker
    const now = Date.now();
    if (now - this.dailyLossResetTime > 86_400_000) {
      this.dailyLoss = 0;
      this.dailyLossResetTime = now;
    }
    const capital = this.context?.wallet.availableBalance ?? 100;
    const maxDailyLossPct = this.cfg.risk?.maxDailyLossPct ?? 20;
    if (this.dailyLoss / Math.max(capital, 1) * 100 >= maxDailyLossPct) return [];

    const signals: Signal[] = [];
    const logic = this.cfg.triggerLogic ?? 'OR';

    for (const [marketId, market] of this.markets) {
      if (!this.passesFilters(market)) continue;

      const prices = this.priceHistory.get(marketId) ?? [];
      if (prices.length < 5) continue;

      const triggerResults = this.cfg.triggers.map(t => this.evaluateTrigger(t, market, prices));

      let fired: boolean;
      if (logic === 'AND') {
        fired = triggerResults.length > 0 && triggerResults.every(r => r !== null);
      } else {
        fired = triggerResults.some(r => r !== null);
      }
      if (!fired) continue;

      // Pick the strongest trigger signal
      const best = triggerResults.filter(r => r !== null).sort((a, b) => b!.confidence * b!.edge - a!.confidence * a!.edge)[0]!;
      signals.push({
        marketId,
        outcome: best.outcome,
        side: best.side,
        confidence: best.confidence,
        edge: best.edge,
      });
    }

    signals.sort((a, b) => b.confidence * b.edge - a.confidence * a.edge);
    return signals.slice(0, maxPos - this.positions.length);
  }

  /* ── Filter Pipeline ────────────────────────────────────────── */
  private passesFilters(m: MarketData): boolean {
    const f = this.cfg.filters;
    if (f.minLiquidity != null && m.liquidity < f.minLiquidity) return false;
    if (f.min24hVolume != null && m.volume24h < f.min24hVolume) return false;
    if (f.maxSpreadBps != null && m.spread * 10_000 > f.maxSpreadBps) return false;

    const yesPrice = m.outcomePrices[0] ?? 0.5;
    if (f.priceFloor != null && yesPrice < f.priceFloor) return false;
    if (f.priceCeiling != null && yesPrice > f.priceCeiling) return false;

    if (f.maxDaysToResolution != null && m.endDate) {
      const daysLeft = (new Date(m.endDate).getTime() - Date.now()) / 86_400_000;
      if (daysLeft > f.maxDaysToResolution) return false;
    }
    if (f.minDaysToResolution != null && m.endDate) {
      const daysLeft = (new Date(m.endDate).getTime() - Date.now()) / 86_400_000;
      if (daysLeft < f.minDaysToResolution) return false;
    }
    return true;
  }

  /* ── Trigger Evaluation ─────────────────────────────────────── */
  private evaluateTrigger(trigger: TriggerConfig, market: MarketData, prices: number[]): { outcome: 'YES' | 'NO'; side: 'BUY' | 'SELL'; confidence: number; edge: number } | null {
    const p = trigger.params;

    switch (trigger.type) {
      case 'ema_crossover': {
        const shortP = Number(p.emaShort ?? 5);
        const longP = Number(p.emaLong ?? 20);
        if (prices.length < longP + 2) return null;
        const emaS = computeEMA(prices, shortP);
        const emaL = computeEMA(prices, longP);
        if (emaS.length < 2 || emaL.length < 2) return null;
        const sc = emaS[emaS.length - 1], sp = emaS[emaS.length - 2];
        const lc = emaL[emaL.length - 1], lp = emaL[emaL.length - 2];
        const bullish = sp <= lp && sc > lc;
        const bearish = sp >= lp && sc < lc;
        const dir = String(p.direction ?? 'both');
        if (bullish && (dir === 'both' || dir === 'bullish')) {
          const edge = Math.min(0.05, Math.abs(sc - lc) * 10);
          return { outcome: 'YES', side: 'BUY', confidence: Math.min(0.8, 0.4 + edge * 5), edge };
        }
        if (bearish && (dir === 'both' || dir === 'bearish')) {
          const edge = Math.min(0.05, Math.abs(sc - lc) * 10);
          return { outcome: 'NO', side: 'BUY', confidence: Math.min(0.8, 0.4 + edge * 5), edge };
        }
        return null;
      }

      case 'rsi_extreme': {
        const period = Number(p.rsiPeriod ?? 14);
        const ob = Number(p.overbought ?? 70);
        const os = Number(p.oversold ?? 30);
        const rsi = computeRSI(prices, period);
        if (rsi > ob) {
          const edge = Math.min(0.04, (rsi - ob) / 500);
          return { outcome: 'NO', side: 'BUY', confidence: Math.min(0.7, 0.3 + edge * 5), edge };
        }
        if (rsi < os) {
          const edge = Math.min(0.04, (os - rsi) / 500);
          return { outcome: 'YES', side: 'BUY', confidence: Math.min(0.7, 0.3 + edge * 5), edge };
        }
        return null;
      }

      case 'price_threshold': {
        const buyBelow = Number(p.buyBelow ?? 0);
        const sellAbove = Number(p.sellAbove ?? 1);
        const yesPrice = market.outcomePrices[0] ?? 0.5;
        if (buyBelow > 0 && yesPrice < buyBelow) {
          const edge = Math.min(0.06, buyBelow - yesPrice);
          return { outcome: 'YES', side: 'BUY', confidence: Math.min(0.75, 0.5 + edge * 3), edge };
        }
        if (sellAbove < 1 && yesPrice > sellAbove) {
          const edge = Math.min(0.06, yesPrice - sellAbove);
          return { outcome: 'NO', side: 'BUY', confidence: Math.min(0.75, 0.5 + edge * 3), edge };
        }
        return null;
      }

      case 'volume_spike': {
        const multiplier = Number(p.volumeMultiplier ?? 3);
        const vols = this.volumeHistory.get(market.marketId) ?? [];
        if (vols.length < 5) return null;
        const avg = vols.slice(0, -1).reduce((s, v) => s + v, 0) / (vols.length - 1);
        const latest = vols[vols.length - 1];
        if (avg > 0 && latest / avg >= multiplier) {
          const yesPrice = market.outcomePrices[0] ?? 0.5;
          const direction = market.oneDayPriceChange ?? 0;
          const edge = Math.min(0.04, (latest / avg - 1) * 0.01);
          if (direction >= 0) {
            return { outcome: 'YES', side: 'BUY', confidence: Math.min(0.7, 0.4 + edge * 4), edge };
          } else {
            return { outcome: 'NO', side: 'BUY', confidence: Math.min(0.7, 0.4 + edge * 4), edge };
          }
        }
        return null;
      }

      case 'probability_band': {
        const minProb = Number(p.minProb ?? 0);
        const maxProb = Number(p.maxProb ?? 1);
        const yesPrice = market.outcomePrices[0] ?? 0.5;
        if (yesPrice >= minProb && yesPrice <= maxProb) {
          // Within band — lean toward YES if low prob, NO if high prob
          const edge = Math.min(0.04, Math.abs(yesPrice - 0.5) * 0.1);
          if (yesPrice < 0.5) {
            return { outcome: 'YES', side: 'BUY', confidence: Math.min(0.65, 0.4 + edge * 3), edge };
          } else {
            return { outcome: 'NO', side: 'BUY', confidence: Math.min(0.65, 0.4 + edge * 3), edge };
          }
        }
        return null;
      }

      case 'mean_reversion': {
        const threshold = Number(p.zScoreThreshold ?? 2.0);
        const lookback = Number(p.lookbackPeriod ?? 20);
        const recent = prices.slice(-lookback);
        const z = zScore(recent);
        if (Math.abs(z) >= threshold) {
          const edge = Math.min(0.05, (Math.abs(z) - threshold) * 0.02);
          if (z > 0) {
            return { outcome: 'NO', side: 'BUY', confidence: Math.min(0.75, 0.4 + edge * 4), edge };
          } else {
            return { outcome: 'YES', side: 'BUY', confidence: Math.min(0.75, 0.4 + edge * 4), edge };
          }
        }
        return null;
      }

      case 'momentum_breakout': {
        const period = Number(p.breakoutPeriod ?? 20);
        const minMove = Number(p.minMovePercent ?? 3);
        if (prices.length < period) return null;
        const start = prices[prices.length - period];
        const end = prices[prices.length - 1];
        const movePct = ((end - start) / Math.max(start, 0.01)) * 100;
        if (Math.abs(movePct) >= minMove) {
          const edge = Math.min(0.05, Math.abs(movePct) / 200);
          if (movePct > 0) {
            return { outcome: 'YES', side: 'BUY', confidence: Math.min(0.7, 0.4 + edge * 4), edge };
          } else {
            return { outcome: 'NO', side: 'BUY', confidence: Math.min(0.7, 0.4 + edge * 4), edge };
          }
        }
        return null;
      }

      default:
        return null;
    }
  }

  /* ── Position Sizing ────────────────────────────────────────── */
  override sizePositions(signals: Signal[]): OrderRequest[] {
    const capital = this.context?.wallet.availableBalance ?? 100;
    const walletId = this.context?.wallet.walletId ?? 'unknown';
    const now = Date.now();
    const sz = this.cfg.sizing;

    return signals
      .filter((s) => {
        const key = `${s.marketId}:${s.outcome}:${s.side}`;
        const last = (this as any).tradeCooldowns?.get(key) ?? 0;
        return now - last > this.cooldownMs;
      })
      .map((signal) => {
        const market = this.markets.get(signal.marketId);

        let size: number;
        switch (sz.mode) {
          case 'fixed':
            size = sz.fixedAmount ?? 10;
            break;
          case 'percent_of_capital':
            size = capital * (sz.positionSizePct ?? 0.02) * signal.confidence;
            break;
          case 'kelly': {
            const p = signal.confidence;
            const b = signal.edge > 0 ? (1 / signal.edge) : 10;
            const kellyPct = Math.max(0, (p * b - (1 - p)) / b);
            size = capital * kellyPct * (sz.kellyFraction ?? 0.25);
            break;
          }
          case 'confidence_scaled':
            size = (sz.baseSize ?? 10) * signal.confidence * (sz.confidenceMultiplier ?? 2);
            break;
          case 'liquidity_aware': {
            const liq = market?.liquidity ?? 500;
            size = liq * (sz.maxLiquidityPct ?? 0.003);
            break;
          }
          default:
            size = 10;
        }

        // Cap to market liquidity
        const liq = market?.liquidity ?? 500;
        size = Math.max(1, Math.floor(Math.min(size, liq * 0.003, 100)));

        // Cap per-market exposure
        const maxPer = this.cfg.risk?.maxPerMarket ?? Infinity;
        if (size > maxPer) size = Math.floor(maxPer);

        const price = signal.side === 'BUY'
          ? Number(Math.min(0.5 + signal.edge, market?.bid ?? 0.5).toFixed(4))
          : Number(Math.max(0.5 - signal.edge, market?.ask ?? 0.5).toFixed(4));

        return {
          walletId,
          marketId: signal.marketId,
          outcome: signal.outcome,
          side: signal.side,
          price: Number(Math.max(0.01, Math.min(0.99, price)).toFixed(4)),
          size,
          strategy: this.name,
        };
      });
  }

  /* ── Fill tracking ──────────────────────────────────────────── */
  override notifyFill(order: OrderRequest): void {
    super.notifyFill(order);
    if (order.strategy !== this.name) return;
    this.positions.push({
      marketId: order.marketId,
      outcome: order.outcome,
      side: order.side,
      entryPrice: order.price,
      size: order.size,
      entryTime: Date.now(),
      peakBps: 0,
    });
  }

  /* ── Position Management (TP / SL / Trailing / Time) ────────── */
  override managePositions(): void {
    const ex = this.cfg.exits;
    const toRemove: number[] = [];

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      const market = this.markets.get(pos.marketId);
      if (!market) continue;

      const currentPrice = pos.outcome === 'YES'
        ? market.outcomePrices[0]
        : (market.outcomePrices[1] ?? 1 - market.outcomePrices[0]);

      const edgeBps = pos.side === 'BUY'
        ? (currentPrice - pos.entryPrice) * 10_000
        : (pos.entryPrice - currentPrice) * 10_000;

      pos.peakBps = Math.max(pos.peakBps, edgeBps);
      const holdingMin = (Date.now() - pos.entryTime) / 60_000;

      let exitReason: string | undefined;

      if (ex.takeProfitBps != null && edgeBps >= ex.takeProfitBps) exitReason = 'TAKE_PROFIT';
      if (!exitReason && ex.stopLossBps != null && edgeBps <= -(ex.stopLossBps)) exitReason = 'STOP_LOSS';
      if (!exitReason && ex.trailingActivationBps != null && ex.trailingDistanceBps != null
        && pos.peakBps > ex.trailingActivationBps
        && edgeBps < pos.peakBps - ex.trailingDistanceBps) exitReason = 'TRAILING_STOP';
      if (!exitReason && ex.maxHoldMinutes != null && holdingMin >= ex.maxHoldMinutes) exitReason = 'TIME_EXIT';
      if (!exitReason && ex.exitAtPrice != null) {
        const yesPrice = market.outcomePrices[0] ?? 0.5;
        if (pos.outcome === 'YES' && yesPrice >= ex.exitAtPrice) exitReason = 'TARGET_PRICE';
        if (pos.outcome === 'NO' && yesPrice <= (1 - ex.exitAtPrice)) exitReason = 'TARGET_PRICE';
      }

      if (exitReason) {
        toRemove.push(i);
        const exitSide = pos.side === 'BUY' ? 'SELL' as const : 'BUY' as const;
        this.pendingExits.push({
          walletId: this.context?.wallet.walletId ?? 'unknown',
          marketId: pos.marketId,
          outcome: pos.outcome,
          side: exitSide,
          price: Number(currentPrice.toFixed(4)),
          size: pos.size,
          strategy: this.name,
        });
        if (edgeBps < 0) this.dailyLoss += Math.abs(edgeBps) * pos.size / 10_000;
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.positions.splice(toRemove[i], 1);
    }
  }

  override shutdown(): void {
    super.shutdown();
    this.priceHistory.clear();
    this.volumeHistory.clear();
    this.positions.length = 0;
  }
}
