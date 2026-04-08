import { MarketData, OrderRequest, Signal, WalletState } from '../types';

export interface StrategyContext {
  wallet: WalletState;
  config: Record<string, unknown>;
}

export interface StrategyInterface {
  readonly name: string;
  initialize(context: StrategyContext): Promise<void> | void;
  onMarketUpdate(data: MarketData): Promise<void> | void;
  onTimer(): Promise<void> | void;
  generateSignals(): Promise<Signal[]> | Signal[];
  sizePositions(signals: Signal[]): Promise<OrderRequest[]> | OrderRequest[];
  submitOrders(orders: OrderRequest[]): Promise<void> | void;
  notifyFill(order: OrderRequest): void;
  managePositions(): Promise<void> | void;
  drainExitOrders(): OrderRequest[];
  shutdown(): Promise<void> | void;
}

export abstract class BaseStrategy implements StrategyInterface {
  abstract readonly name: string;
  protected context?: StrategyContext;

  /** Live market cache populated by onMarketUpdate(). Capped at MAX_MARKETS. */
  protected markets = new Map<string, MarketData>();
  private static readonly MAX_MARKETS = 1_000;

  /**
   * Exit orders queued by managePositions() — the engine drains and
   * routes these through the wallet after each tick.
   */
  protected pendingExits: OrderRequest[] = [];

  /**
   * Per-market cooldown: prevents trading the same market more than once
   * within a cooldown window (default 60 seconds).
   */
  private tradeCooldowns = new Map<string, number>();
  protected cooldownMs = 60_000;
  private lastCooldownPrune = 0;

  initialize(context: StrategyContext): void {
    this.context = context;
  }

  onMarketUpdate(data: MarketData): void {
    this.markets.set(data.marketId, data);
    // Evict oldest entries when map exceeds cap (FIFO)
    if (this.markets.size > BaseStrategy.MAX_MARKETS) {
      const excess = this.markets.size - BaseStrategy.MAX_MARKETS;
      const iter = this.markets.keys();
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value;
        if (key !== undefined) {
          this.markets.delete(key);
          this.onMarketEvicted(key);
        }
      }
    }
  }

  /**
   * Called when a market is evicted from the base `markets` cache.
   * Override in subclasses to clean up strategy-specific maps keyed by
   * marketId (e.g. priceHistory, volumeHistory) so they don't grow
   * unbounded even after the base cache evicts the market.
   */
  protected onMarketEvicted(_marketId: string): void {
    // Default no-op; subclasses override
  }

  onTimer(): void {
    return;
  }

  abstract generateSignals(): Signal[];

  /** Filter signals through cooldown, then size them */
  sizePositions(signals: Signal[]): OrderRequest[] {
    const now = Date.now();
    const walletId = this.context?.wallet.walletId ?? 'unknown';

    // Filter out signals for markets still in cooldown
    const filtered = signals.filter((s) => {
      const key = `${s.marketId}:${s.outcome}:${s.side}`;
      const lastTrade = this.tradeCooldowns.get(key) ?? 0;
      return now - lastTrade > this.cooldownMs;
    });

    return filtered.map((signal) => {
      const key = `${signal.marketId}:${signal.outcome}:${signal.side}`;

      // Use actual market price when available, fall back to 0.5 + edge
      const market = this.markets.get(signal.marketId);
      let price: number;
      if (market) {
        price = signal.outcome === 'YES'
          ? market.outcomePrices[0]
          : (market.outcomePrices[1] ?? 1 - market.outcomePrices[0]);
      } else {
        price = Number((0.5 + signal.edge).toFixed(4));
      }

      return {
        walletId,
        marketId: signal.marketId,
        outcome: signal.outcome,
        side: signal.side,
        price: Number(Math.max(0.01, Math.min(0.99, price)).toFixed(4)),
        size: Math.max(1, Math.floor(10 * signal.confidence)),
        strategy: this.name,
      };
    });
  }

  submitOrders(_orders: OrderRequest[]): void {
    return;
  }

  /**
   * Called by the engine after a successful fill.
   * Override in subclasses to track positions.
   */
  notifyFill(order: OrderRequest): void {
    // Record cooldown only after a successful fill, not at sizing time
    const key = `${order.marketId}:${order.outcome}:${order.side}`;
    const now = Date.now();
    this.tradeCooldowns.set(key, now);

    // Prune expired cooldowns every 5 minutes
    if (now - this.lastCooldownPrune > 300_000) {
      this.lastCooldownPrune = now;
      for (const [k, ts] of this.tradeCooldowns) {
        if (now - ts > this.cooldownMs * 2) this.tradeCooldowns.delete(k);
      }
    }
  }

  managePositions(): void {
    return;
  }

  /** Return and clear any exit orders queued during managePositions() */
  drainExitOrders(): OrderRequest[] {
    const exits = this.pendingExits;
    this.pendingExits = [];
    return exits;
  }

  shutdown(): void {
    this.markets.clear();
    this.tradeCooldowns.clear();
    this.pendingExits = [];
  }
}
