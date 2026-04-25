import { PaperWallet } from './paper_wallet';
import { PolymarketWallet } from './polymarket_wallet';
import { WalletState, WalletConfig, TradeRecord, FeeConfig, LiveTradingConfig, OrderFill } from '../types';
import { logger } from '../reporting/logs';
import type { TradingDB } from '../storage/trading_db';
import type { Database } from '../storage/database';

export interface ExecutionWallet {
  getState(): WalletState;
  getTradeHistory(): readonly TradeRecord[];
  placeOrder(request: {
    marketId: string;
    outcome: 'YES' | 'NO';
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
    tokenId?: string;
  }): Promise<unknown>;
  updateBalance(delta: number): void;
  /** Optional display name for the dashboard (defaults to walletId) */
  getDisplayName?(): string;
  setDisplayName?(name: string): void;
  /** Update risk limits at runtime */
  updateRiskLimits?(limits: Partial<import('../types').RiskLimits>): void;
  /** Total fees accrued across all fills */
  getTotalFeesAccrued?(): number;
  /** Release a reserved balance (e.g. when an order is cancelled) */
  releaseBalance?(amount: number): void;
  /** Apply a confirmed fill from the order tracker */
  applyFill?(fill: OrderFill): void;
}

export class WalletManager {
  private readonly wallets = new Map<string, ExecutionWallet>();
  private tradingDb: TradingDB | undefined;
  private db: Database | undefined;

  constructor(db?: Database) {
    this.db = db;
  }

  setTradingDb(db: TradingDB): void {
    this.tradingDb = db;
  }

  getTradingDb(): TradingDB | undefined {
    return this.tradingDb;
  }

  registerWallet(
    config: WalletConfig,
    assignedStrategy: string,
    enableLive: boolean,
    liveCfg?: LiveTradingConfig,
    feeCfg?: FeeConfig,
  ): void {
    if (this.wallets.has(config.id)) {
      throw new Error(`Wallet ${config.id} already registered`);
    }

    if (config.mode === 'LIVE' && !enableLive) {
      logger.error(
        { walletId: config.id },
        'LIVE trading requested but ENABLE_LIVE_TRADING is false — falling back to PAPER mode',
      );
      console.error(`[WalletManager] WARNING: wallet "${config.id}" requested LIVE mode but ENABLE_LIVE_TRADING is not enabled — running as PAPER`);
      config = { ...config, mode: 'PAPER' };
    }

    const wallet =
      config.mode === 'LIVE'
        ? new PolymarketWallet(config, assignedStrategy, this.db, liveCfg, feeCfg)
        : new PaperWallet(config, assignedStrategy, this.tradingDb, feeCfg);

    this.wallets.set(config.id, wallet);
    const state = wallet.getState();
    logger.info(
      { walletId: state.walletId, mode: state.mode, strategy: state.assignedStrategy, capital: state.capitalAllocated },
      `Registered wallet ${state.walletId} (${state.mode}) strategy=${state.assignedStrategy}`,
    );
  }

  getWallet(walletId: string): ExecutionWallet | undefined {
    return this.wallets.get(walletId);
  }

  listWallets(): WalletState[] {
    return Array.from(this.wallets.values()).map((wallet) => wallet.getState());
  }

  /** Total fees accrued across all wallets */
  getTotalFeesAccrued(): number {
    let total = 0;
    for (const wallet of this.wallets.values()) {
      total += wallet.getTotalFeesAccrued?.() ?? 0;
    }
    return total;
  }

  /** Per-wallet fee totals */
  getWalletFees(): Array<{ walletId: string; totalFeesAccrued: number }> {
    return Array.from(this.wallets.entries()).map(([id, wallet]) => ({
      walletId: id,
      totalFeesAccrued: wallet.getTotalFeesAccrued?.() ?? 0,
    }));
  }

  getTradeHistory(walletId: string): readonly TradeRecord[] {
    const wallet = this.wallets.get(walletId);
    if (!wallet) return [];
    return wallet.getTradeHistory();
  }

  getAllTradeHistories(): Map<string, readonly TradeRecord[]> {
    const map = new Map<string, readonly TradeRecord[]>();
    for (const [id, wallet] of this.wallets) {
      map.set(id, wallet.getTradeHistory());
    }
    return map;
  }

  removeWallet(walletId: string): boolean {
    if (!this.wallets.has(walletId)) {
      return false;
    }
    this.wallets.delete(walletId);
    logger.info({ walletId }, `Wallet ${walletId} removed`);
    return true;
  }

  registerExternalWallet(walletId: string, wallet: ExecutionWallet): void {
    if (this.wallets.has(walletId)) {
      throw new Error(`Wallet ${walletId} already registered`);
    }
    this.wallets.set(walletId, wallet);
  }

  addWallet(wallet: ExecutionWallet): void {
    const state = wallet.getState();
    if (this.wallets.has(state.walletId)) {
      throw new Error(`Wallet ${state.walletId} already registered`);
    }
    this.wallets.set(state.walletId, wallet);
    logger.info(
      { walletId: state.walletId, mode: state.mode, strategy: state.assignedStrategy, capital: state.capitalAllocated },
      `Wallet ${state.walletId} added at runtime (${state.mode}) strategy=${state.assignedStrategy}`,
    );
  }
}
