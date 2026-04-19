import { WalletConfig, WalletState, Position, TradeRecord, RiskLimits, OrderFill, FeeConfig, LiveTradingConfig } from '../types';
import { logger } from '../reporting/logs';
import { consoleLog } from '../reporting/console_log';
import type { Database } from '../storage/database';
import { getClobClient } from '../utils/clob_client';
import { loadClobSdk } from '../utils/clob_sdk';

export interface OrderPlacementResult {
  status: 'submitted' | 'filled' | 'rejected' | 'error';
  orderId: string | null;
  filledSize: number;
  reason?: string;
}

interface OrderTrackerRef {
  getPendingForWallet(walletId: string): unknown[];
}

export class PolymarketWallet {
  private static readonly MAX_TRADE_HISTORY = 10_000;
  private state: WalletState;
  private readonly trades: TradeRecord[] = [];
  private displayName: string = '';
  private readonly liveCfg: LiveTradingConfig;
  private readonly feeCfg: FeeConfig;
  private readonly db: Database | null;
  private reserved: number = 0;
  private dailyOrderCount: number = 0;
  private orderTracker: OrderTrackerRef | null = null;
  private totalFeesAccrued: number = 0;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;

  private static readonly DEFAULT_LIVE_CFG: LiveTradingConfig = {
    maxSingleOrderCost: 100,
    maxPendingOrders: 5,
    maxDailyOrders: 100,
    orderTimeoutSeconds: 120,
    minBalanceReserve: 0,
  };

  private static readonly DEFAULT_FEE_CFG: FeeConfig = {
    takerFeeRate: 0,
    makerFeeRate: 0,
  };

  constructor(
    config: WalletConfig,
    assignedStrategy: string,
    db?: Database,
    liveCfg?: LiveTradingConfig,
    feeCfg?: FeeConfig,
  ) {
    this.db = db ?? null;
    this.liveCfg = liveCfg ?? PolymarketWallet.DEFAULT_LIVE_CFG;
    this.feeCfg = feeCfg ?? PolymarketWallet.DEFAULT_FEE_CFG;
    this.displayName = config.id;
    this.state = {
      walletId: config.id,
      mode: 'LIVE',
      assignedStrategy,
      capitalAllocated: config.capital,
      availableBalance: config.capital,
      openPositions: [],
      realizedPnl: 0,
      riskLimits: {
        maxPositionSize: config.riskLimits?.maxPositionSize ?? 100,
        maxExposurePerMarket: config.riskLimits?.maxExposurePerMarket ?? 200,
        maxDailyLoss: config.riskLimits?.maxDailyLoss ?? 100,
        maxOpenTrades: config.riskLimits?.maxOpenTrades ?? 5,
        maxDrawdown: config.riskLimits?.maxDrawdown ?? 0.2,
      },
    };
    // store walletAddress for reconciliation if provided
    if (config.walletAddress) {
      (this.state as unknown as Record<string, unknown>)['walletAddress'] = config.walletAddress;
    }
  }

  /** Inject an order tracker so pending counts can be checked before placing */
  setOrderTracker(tracker: OrderTrackerRef): void {
    this.orderTracker = tracker;
  }

  getState(): WalletState {
    return { ...this.state, openPositions: [...this.state.openPositions] };
  }

  getTradeHistory(): readonly TradeRecord[] {
    return this.trades;
  }

  /** Available balance minus any reserved funds for pending orders */
  getAvailableBalance(): number {
    return this.state.availableBalance - this.reserved;
  }

  getDailyOrderCount(): number {
    return this.dailyOrderCount;
  }

  getTotalFeesAccrued(): number {
    return this.totalFeesAccrued;
  }

  /** Reserve funds for a pending order (prevents double-spend) */
  reserveBalance(amount: number): void {
    this.reserved += amount;
  }

  /** Release a prior reservation */
  releaseReservation(amount: number): void {
    this.reserved = Math.max(0, this.reserved - amount);
  }

  /** Alias used by OrderTracker via ExecutionWallet interface */
  releaseBalance(amount: number): void {
    this.releaseReservation(amount);
  }

  updateBalance(delta: number): void {
    this.state.availableBalance += delta;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  setDisplayName(name: string): void {
    this.displayName = name.trim() || this.state.walletId;
  }

  updateRiskLimits(limits: Partial<RiskLimits>): void {
    if (limits.maxPositionSize !== undefined) this.state.riskLimits.maxPositionSize = limits.maxPositionSize;
    if (limits.maxExposurePerMarket !== undefined) this.state.riskLimits.maxExposurePerMarket = limits.maxExposurePerMarket;
    if (limits.maxDailyLoss !== undefined) this.state.riskLimits.maxDailyLoss = limits.maxDailyLoss;
    if (limits.maxOpenTrades !== undefined) this.state.riskLimits.maxOpenTrades = limits.maxOpenTrades;
    if (limits.maxDrawdown !== undefined) this.state.riskLimits.maxDrawdown = limits.maxDrawdown;
    logger.info({ walletId: this.state.walletId, riskLimits: this.state.riskLimits }, 'Risk limits updated');
  }

  async placeOrder(request: {
    marketId: string;
    outcome: 'YES' | 'NO';
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
    tokenId?: string;
  }): Promise<OrderPlacementResult> {
    const cost = request.price * request.size;

    // ── Pre-flight checks (fast, no I/O) ──

    // 1. tokenId required for V2
    if (!request.tokenId) {
      return { status: 'rejected', orderId: null, filledSize: 0, reason: 'tokenId required for V2 order submission' };
    }

    // 2. Daily order limit
    if (this.dailyOrderCount >= this.liveCfg.maxDailyOrders) {
      return { status: 'rejected', orderId: null, filledSize: 0, reason: `maxDailyOrders (${this.liveCfg.maxDailyOrders}) reached` };
    }

    // 3. maxSingleOrderCost
    if (cost > this.liveCfg.maxSingleOrderCost) {
      return { status: 'rejected', orderId: null, filledSize: 0, reason: `maxSingleOrderCost (${this.liveCfg.maxSingleOrderCost}) exceeded — order cost ${cost}` };
    }

    // 4. Pending orders limit
    if (this.orderTracker) {
      const pending = this.orderTracker.getPendingForWallet(this.state.walletId);
      if (pending.length >= this.liveCfg.maxPendingOrders) {
        return { status: 'rejected', orderId: null, filledSize: 0, reason: `maxPendingOrders (${this.liveCfg.maxPendingOrders}) reached` };
      }
    }

    // 5. Insufficient balance
    const available = this.getAvailableBalance();
    if (available < cost) {
      return { status: 'rejected', orderId: null, filledSize: 0, reason: `insufficient balance — available ${available.toFixed(2)}, cost ${cost.toFixed(2)}` };
    }

    // 6. Min balance reserve
    if (available - cost < this.liveCfg.minBalanceReserve) {
      return { status: 'rejected', orderId: null, filledSize: 0, reason: `minBalanceReserve (${this.liveCfg.minBalanceReserve}) would be breached` };
    }

    // Reserve funds before async network call
    this.reserveBalance(cost);

    // 7. ClobClient — cached after first call
    const client = await getClobClient();
    if (!client) {
      this.releaseReservation(cost);
      logger.warn({ walletId: this.state.walletId }, 'ClobClient not available — rejecting order');
      return { status: 'rejected', orderId: null, filledSize: 0, reason: 'POLYMARKET_PRIVATE_KEY not set — cannot place LIVE order' };
    }

    /* ── Submit order via V2 SDK ── */
    const fallbackOrderId = `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { Side, OrderType } = await loadClobSdk();
    let sdkResponse: { orderID?: string; success?: boolean; errorMsg?: string } | null = null;
    try {
      sdkResponse = await client.createAndPostOrder(
        {
          tokenID: request.tokenId,
          price: request.price,
          size: request.size,
          side: request.side === 'BUY' ? Side.BUY : Side.SELL,
        },
        { tickSize: '0.01' },
        OrderType.GTC,
      ) as { orderID?: string; success?: boolean; errorMsg?: string };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ walletId: this.state.walletId, error: msg }, 'LIVE order SDK error');
      this.releaseReservation(cost);
      return { status: 'error', orderId: null, filledSize: 0, reason: msg };
    }

    if (sdkResponse && sdkResponse.success === false) {
      logger.warn({ walletId: this.state.walletId, errorMsg: sdkResponse.errorMsg }, 'LIVE order rejected by CLOB');
      this.releaseReservation(cost);
      return { status: 'rejected', orderId: null, filledSize: 0, reason: sdkResponse.errorMsg ?? 'order rejected' };
    }

    /* ── Order accepted ── */
    const clobOrderId = sdkResponse?.orderID ?? fallbackOrderId;

    // Reservation stays held — applyFill() is the sole debit path.
    // releaseBalance() will free it when the order fills or is cancelled/timed-out.

    this.dailyOrderCount++;

    this.trades.push({
      orderId: clobOrderId,
      walletId: this.state.walletId,
      marketId: request.marketId,
      outcome: request.outcome,
      side: request.side,
      price: request.price,
      size: request.size,
      cost,
      realizedPnl: 0,
      cumulativePnl: this.state.realizedPnl,
      balanceAfter: this.getAvailableBalance(),
      timestamp: Date.now(),
    });

    if (this.trades.length > PolymarketWallet.MAX_TRADE_HISTORY) {
      this.trades.splice(0, this.trades.length - PolymarketWallet.MAX_TRADE_HISTORY);
    }

    logger.info(
      { walletId: this.state.walletId, orderId: clobOrderId, marketId: request.marketId },
      'LIVE order submitted',
    );

    return { status: 'submitted', orderId: clobOrderId, filledSize: 0 };
  }

  /**
   * Apply an externally-confirmed fill from the OrderTracker.
   * Called when the CLOB reports MATCHED status.
   */
  applyFill(fill: OrderFill): void {
    const cost = fill.price * fill.size;
    const feeRate = this.feeCfg.takerFeeRate;
    const fee = Math.round(cost * feeRate * 100) / 100;

    // Release any reservation that was made when the order was placed,
    // then deduct the confirmed fill cost + fee from the actual balance.
    this.releaseReservation(cost);
    this.state.availableBalance -= (cost + fee);
    this.totalFeesAccrued += fee;

    this._applyPositionChange(fill.marketId, fill.outcome, fill.side, fill.price, fill.size);

    logger.info(
      { walletId: this.state.walletId, orderId: fill.orderId, cost, fee },
      'LIVE fill applied',
    );

    consoleLog.success('FILL', `[${this.state.walletId}] ${fill.side} ${fill.outcome} x${fill.size} @ $${fill.price} fee=$${fee}`);
  }

  /**
   * Fetch on-chain USDC balance and compare with tracked balance.
   * Logs a warning if the discrepancy exceeds 1 USDC.
   */
  async reconcileBalance(): Promise<void> {
    const walletAddress = (this.state as unknown as Record<string, unknown>)['walletAddress'] as string | undefined;
    if (!walletAddress) return;

    // pUSD (V2 collateral) — 18 decimals
    const COLLATERAL_ADDRESS = process.env.POLYMARKET_COLLATERAL_ADDRESS ?? '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
    const COLLATERAL_DECIMALS = parseInt(process.env.POLYMARKET_COLLATERAL_DECIMALS ?? '18', 10);
    const RPC = process.env.POLYGON_RPC ?? 'https://polygon-rpc.com';

    // ERC-20 balanceOf(address) call
    const data = `0x70a08231000000000000000000000000${walletAddress.slice(2).toLowerCase()}`;

    let onChainBalance: number;
    try {
      const resp = await fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'eth_call', id: 1,
          params: [{ to: COLLATERAL_ADDRESS, data }, 'latest'],
        }),
      });
      const body = await resp.json() as { result: string };
      onChainBalance = Number(BigInt(body.result)) / Math.pow(10, COLLATERAL_DECIMALS);
    } catch (err) {
      logger.warn({ walletId: this.state.walletId, err: String(err) }, 'reconcileBalance: RPC call failed');
      return;
    }

    const expected = this.state.availableBalance;
    const diff = Math.abs(onChainBalance - expected);

    if (diff > 1) {
      logger.warn(
        { walletId: this.state.walletId, onChain: onChainBalance, expected, diff },
        'reconcileBalance: on-chain balance differs from expected by more than 1 pUSD',
      );
    }
  }

  /** Start periodic balance reconciliation */
  startReconciliation(intervalMs: number): void {
    if (this.reconcileTimer) return;
    this.reconcileTimer = setInterval(() => {
      void this.reconcileBalance();
    }, intervalMs);
  }

  /** Stop periodic balance reconciliation */
  stopReconciliation(): void {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  private _applyPositionChange(
    marketId: string,
    outcome: 'YES' | 'NO',
    side: 'BUY' | 'SELL',
    price: number,
    size: number,
  ): void {
    const existing = this.state.openPositions.find(
      (p) => p.marketId === marketId && p.outcome === outcome,
    );

    if (!existing) {
      if (side === 'BUY') {
        this.state.openPositions.push({
          marketId, outcome, size, avgPrice: price, realizedPnl: 0,
        });
      }
      return;
    }

    if (side === 'BUY') {
      const newSize = existing.size + size;
      existing.avgPrice = (existing.avgPrice * existing.size + price * size) / newSize;
      existing.size = newSize;
    } else {
      existing.size -= Math.min(size, existing.size);
      if (existing.size <= 0) {
        existing.size = 0;
        existing.avgPrice = 0;
      }
    }

    this.state.openPositions = this.state.openPositions.filter((p) => p.size > 0);
  }
}
