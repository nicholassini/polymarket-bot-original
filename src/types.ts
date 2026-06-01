export type TradingMode = 'LIVE' | 'PAPER';

export interface RiskLimits {
  maxPositionSize: number;
  maxExposurePerMarket: number;
  maxDailyLoss: number;
  maxOpenTrades: number;
  maxDrawdown: number;
}

export interface WalletConfig {
  id: string;
  mode: TradingMode;
  strategy: string;
  capital: number;
  riskLimits?: Partial<RiskLimits>;
  /** On-chain wallet address for balance reconciliation (LIVE mode only) */
  walletAddress?: string;
}

export interface FeeConfig {
  takerFeeRate: number;
  makerFeeRate: number;
}

export interface LiveTradingConfig {
  maxSingleOrderCost: number;
  maxPendingOrders: number;
  maxDailyOrders: number;
  orderTimeoutSeconds: number;
  minBalanceReserve: number;
}

export interface EnvironmentConfig {
  enableLiveTrading: boolean;
}

export interface PolymarketConfig {
  gammaApi: string;
  clobApi: string;
  maxMarkets?: number;
}

export interface StrategyConfigMap {
  [strategyName: string]: Record<string, unknown> | undefined;
}

export interface AppConfig {
  environment: EnvironmentConfig;
  wallets: WalletConfig[];
  strategyConfig: StrategyConfigMap;
  polymarket: PolymarketConfig;
  fees: FeeConfig;
  liveTrading: LiveTradingConfig;
}

export type OrderSide = 'BUY' | 'SELL';
export type OrderOutcome = 'YES' | 'NO';

export interface OrderRequest {
  walletId: string;
  marketId: string;
  outcome: OrderOutcome;
  side: OrderSide;
  price: number;
  size: number;
  strategy: string;
  tokenId?: string;
  /** CTF condition ID — required for reconciler win/loss check and CTF.redeemPositions calls. */
  conditionId?: string;
}

export interface OrderFill {
  orderId: string;
  marketId: string;
  tokenId?: string;
  /** CTF condition ID propagated from order submission — used by reconciler. */
  conditionId?: string;
  txHash?: string;
  outcome: OrderOutcome;
  side: OrderSide;
  price: number;
  size: number;
  timestamp: number;
}

export interface MarketData {
  marketId: string;
  question: string;
  slug: string;
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  midPrice: number;
  bid: number;
  ask: number;
  spread: number;
  volume24h: number;
  liquidity: number;
  timestamp: number;
  /** ISO-8601 end / resolution date from Gamma (may be absent) */
  endDate?: string;
  /** Gamma event ID – used for correlation / cluster grouping */
  eventId?: string;
  /** Gamma event slug – human-readable event identifier */
  eventSlug?: string;
  /** Series slug for recurring events (e.g. "nba-2026") */
  seriesSlug?: string;
  /** 1-day price change reported by Gamma */
  oneDayPriceChange?: number;
  /** 1-week price change reported by Gamma */
  oneWeekPriceChange?: number;
  /** CTF condition ID — required for reconciler position lookup. */
  conditionId?: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Convergence strategy configuration
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface ConvergenceConfig {
  enabled: boolean;
  /* ── Market selection filters ── */
  min_liquidity_usd: number;
  min_prob: number;
  max_prob: number;
  max_spread_bps: number;
  max_days_to_resolution: number;
  spike_pct: number;
  spike_lookback_minutes: number;
  min_depth_usd_within_1pct: number;
  min_imbalance: number;
  flow_lookback_minutes: number;
  min_net_buy_flow_usd: number;
  max_correlated_exposure_pct: number;
  /* ── Position sizing ── */
  base_risk_pct: number;
  max_position_usd_per_market: number;
  max_total_open_positions: number;
  /* ── Entry ── */
  ttl_seconds: number;
  allow_take_on_momentum: boolean;
  /* ── Exit ── */
  take_profit_bps: number;
  stop_loss_bps: number;
  time_exit_hours: number;
  /* ── Risk ── */
  max_daily_loss_pct: number;
  max_weekly_drawdown_pct: number;
  max_market_mle_pct: number;
  max_total_mle_pct: number;
  max_orders_per_minute: number;
  max_cancel_rate: number;
}

export interface Signal {
  marketId: string;
  outcome: OrderOutcome;
  side: OrderSide;
  confidence: number;
  edge: number;
}

export interface Position {
  marketId: string;
  outcome: OrderOutcome;
  size: number;
  avgPrice: number;
  realizedPnl: number;
  /** CLOB token ID — populated when position is opened from a live fill. */
  tokenId?: string;
  /** CTF condition ID — populated when position is opened from a live fill, used by reconciler. */
  conditionId?: string;
}

export interface WalletState {
  walletId: string;
  mode: TradingMode;
  assignedStrategy: string;
  capitalAllocated: number;
  availableBalance: number;
  openPositions: Position[];
  realizedPnl: number;
  riskLimits: RiskLimits;
  /** Daily PnL — reset each midnight UTC */
  dailyPnl?: number;
  /** ISO-8601 timestamp of when dailyPnl was last reset */
  dailyPnlResetAt?: string;
}

export interface TradeRecord {
  orderId: string;
  walletId: string;
  marketId: string;
  outcome: OrderOutcome;
  side: OrderSide;
  price: number;
  size: number;
  cost: number;
  realizedPnl: number;
  cumulativePnl: number;
  balanceAfter: number;
  timestamp: number;
  feeAmount?: number;
  feeRate?: number;
  /** 'taker' or 'maker' — derived from order type */
  orderType?: string;
}
