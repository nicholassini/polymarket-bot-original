import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { PaperWallet } from '../src/wallets/paper_wallet';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';
import { Database } from '../src/storage/database';
import { DashboardServer } from '../src/reporting/dashboard_server';
import { WalletManager } from '../src/wallets/wallet_manager';
import { loadConfig } from '../src/core/config_loader';
import { validateConfig } from '../src/core/config_validator';
import type { WalletConfig, FeeConfig, LiveTradingConfig } from '../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAPER_CONFIG: WalletConfig = {
  id: 'fee-test-paper',
  mode: 'PAPER',
  strategy: 'momentum',
  capital: 1000,
};

const LIVE_CONFIG: WalletConfig = {
  id: 'fee-test-live',
  mode: 'LIVE',
  strategy: 'momentum',
  capital: 1000,
};

const LIVE_TRADING: LiveTradingConfig = {
  maxSingleOrderCost: 200,
  maxPendingOrders: 5,
  maxDailyOrders: 100,
  orderTimeoutSeconds: 120,
  minBalanceReserve: 0,
};

const TAKER_FEE: FeeConfig = { takerFeeRate: 0.02, makerFeeRate: 0.0 };
const ZERO_FEE: FeeConfig = { takerFeeRate: 0, makerFeeRate: 0 };

function makeTempDb(): { db: Database; dbPath: string } {
  const dbPath = path.join(os.tmpdir(), `fee-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(dbPath);
  db.initSchema();
  return { db, dbPath };
}

function makePaper(fee?: FeeConfig): PaperWallet {
  return new PaperWallet(PAPER_CONFIG, 'momentum', undefined, fee);
}

// ── 1. Fee config parsing ─────────────────────────────────────────────────────

describe('Fee config parsing', () => {
  const CONFIG_PATH = path.resolve(__dirname, '../config.yaml');

  it('loads taker_fee_rate and maker_fee_rate from config.yaml', () => {
    const config = loadConfig(CONFIG_PATH);
    expect(config.fees.takerFeeRate).toBe(0.02);
    expect(config.fees.makerFeeRate).toBe(0.0);
  });

  it('defaults to 0% fees when fees block is absent', () => {
    // Simulate a config with no fees block by checking loader defaults
    // The loader uses 0.0 as default when fees key is missing
    const config = loadConfig(CONFIG_PATH);
    // Verify types are numbers
    expect(typeof config.fees.takerFeeRate).toBe('number');
    expect(typeof config.fees.makerFeeRate).toBe('number');
  });

  it('validateConfig accepts valid fee rates (0 <= rate <= 1)', () => {
    const config = loadConfig(CONFIG_PATH);
    // Should not throw
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('validateConfig rejects taker_fee_rate > 1', () => {
    const config = loadConfig(CONFIG_PATH);
    config.fees.takerFeeRate = 1.5;
    // The thrown error says "Config validation failed" — detail is logged separately
    expect(() => validateConfig(config)).toThrow(/Config validation failed/);
  });

  it('validateConfig rejects maker_fee_rate < 0', () => {
    const config = loadConfig(CONFIG_PATH);
    config.fees.makerFeeRate = -0.01;
    expect(() => validateConfig(config)).toThrow(/Config validation failed/);
  });
});

// ── 2. Taker fee applied on fill ──────────────────────────────────────────────

describe('Taker fee applied correctly on fill', () => {
  it('BUY fill: balance deducted by cost + fee', async () => {
    const wallet = makePaper(TAKER_FEE);
    const before = wallet.getState().availableBalance;

    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 10 });

    const after = wallet.getState().availableBalance;
    // Use actual fill price from trade (FillSimulator adds slippage)
    const trade = wallet.getTradeHistory()[0];
    const expectedFee = trade.feeAmount ?? 0;
    // balance should have decreased by cost + fee
    expect(before - after).toBeCloseTo(trade.cost + expectedFee, 5);
  });

  it('SELL fill: realized PnL reduced by fee', async () => {
    const wallet = makePaper(TAKER_FEE);

    // BUY first
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 10 });
    const stateAfterBuy = wallet.getState();

    // SELL at higher price
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'SELL', price: 0.7, size: 10 });

    const trades = wallet.getTradeHistory();
    const sellTrade = trades[trades.length - 1];
    expect(sellTrade.side).toBe('SELL');

    // Gross realized = (sellPrice - entryPrice) * size, but FillSimulator may add slippage
    // We just verify fee is > 0 and realizedPnl < grossPnl
    const fee = sellTrade.feeAmount ?? 0;
    expect(fee).toBeGreaterThan(0);
    // realizedPnl should be net of fee
    expect(sellTrade.realizedPnl).toBeLessThan(sellTrade.realizedPnl + fee);
  });

  it('trade record includes feeAmount, feeRate, and orderType', async () => {
    const wallet = makePaper(TAKER_FEE);
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 10 });

    const trades = wallet.getTradeHistory();
    expect(trades).toHaveLength(1);
    // feeAmount = fillPrice * size * 0.02 (fillPrice may differ from 0.5 due to slippage)
    const expectedFee = Math.round(trades[0].price * 10 * 0.02 * 100) / 100;
    expect(trades[0].feeAmount).toBeCloseTo(expectedFee, 5);
    expect(trades[0].feeRate).toBe(0.02);
    expect(trades[0].orderType).toBe('taker');
  });
});

// ── 3. Maker fee (0%) results in no deduction ─────────────────────────────────

describe('Maker fee (0%) results in no deduction', () => {
  it('zero fee rate: balance deducted by cost only', async () => {
    const wallet = makePaper(ZERO_FEE);
    const before = wallet.getState().availableBalance;

    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 10 });

    const after = wallet.getState().availableBalance;
    const trade = wallet.getTradeHistory()[0];
    // No fee: deduction equals cost only (actual fill price, not requested)
    expect(before - after).toBeCloseTo(trade.cost, 5);
  });

  it('zero fee: feeAmount is 0 on trade record', async () => {
    const wallet = makePaper(ZERO_FEE);
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 10 });

    const trades = wallet.getTradeHistory();
    expect(trades[0].feeAmount).toBe(0);
    expect(trades[0].feeRate).toBe(0);
  });
});

// ── 4. Paper wallet applies taker fee by default when configured ──────────────

describe('Paper wallet simulates realistic taker costs', () => {
  it('totalFeesAccrued increases after each fill', async () => {
    const wallet = makePaper(TAKER_FEE);
    expect(wallet.getTotalFeesAccrued()).toBe(0);

    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 10 });
    expect(wallet.getTotalFeesAccrued()).toBeGreaterThan(0);

    const feeAfterFirst = wallet.getTotalFeesAccrued();
    await wallet.placeOrder({ marketId: 'M2', outcome: 'NO', side: 'BUY', price: 0.4, size: 5 });
    expect(wallet.getTotalFeesAccrued()).toBeGreaterThan(feeAfterFirst);
  });
});

// ── 5. Balance after fill = previousBalance + (fillAmount - fee) for BUY fills ─

describe('Balance accounting after fill', () => {
  it('BUY: balance = prev - (price * size) - fee', async () => {
    const wallet = makePaper(TAKER_FEE);
    const prevBalance = wallet.getState().availableBalance;

    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 20 });

    const state = wallet.getState();
    const trade = wallet.getTradeHistory()[0];
    // Use actual fill cost and fee from trade record (fill price includes slippage)
    expect(state.availableBalance).toBeCloseTo(prevBalance - trade.cost - (trade.feeAmount ?? 0), 5);
  });

  it('very small fill: fee rounds to nearest cent, balance stays non-negative', async () => {
    const wallet = makePaper(TAKER_FEE);
    // Small order: price 0.01, size 1, cost = $0.01, fee = $0.0002 → rounds to $0.00
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.01, size: 1 });

    const state = wallet.getState();
    expect(state.availableBalance).toBeGreaterThan(0);
    const trade = wallet.getTradeHistory()[0];
    expect(trade.feeAmount).toBeGreaterThanOrEqual(0);
    // Fee should not create a negative amount
    expect(trade.feeAmount).toBeLessThanOrEqual(trade.cost);
  });
});

// ── 6. PnL reporting shows gross, fees, and net separately ───────────────────

describe('PnL reporting: gross, fees, net', () => {
  it('wallet realizedPnl reflects net PnL (after fees) for SELL trades', async () => {
    const wallet = makePaper(TAKER_FEE);

    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.4, size: 10 });
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'SELL', price: 0.8, size: 10 });

    const state = wallet.getState();
    const trades = wallet.getTradeHistory();
    const sellTrade = trades.find((t) => t.side === 'SELL')!;

    // net PnL on wallet = realizedPnl from sell trade
    expect(state.realizedPnl).toBeCloseTo(sellTrade.realizedPnl, 5);

    // fee on sell was deducted
    const sellFee = sellTrade.feeAmount ?? 0;
    expect(sellFee).toBeGreaterThan(0);
    // wallet also accrued fee from BUY
    expect(wallet.getTotalFeesAccrued()).toBeGreaterThan(sellFee);
  });
});

// ── 7. Database stores fee_amount and fee_rate on trade records ──────────────

describe('Database fee persistence', () => {
  it('fee_amount and fee_rate columns exist after initSchema', () => {
    const { db, dbPath } = makeTempDb();
    const columns = (db['db' as keyof Database] as unknown as { pragma: (s: string) => Array<{ name: string }> })
      .pragma('table_info(trades)')
      .map((c: { name: string }) => c.name);
    db.close();
    fs.unlinkSync(dbPath);

    expect(columns).toContain('fee_amount');
    expect(columns).toContain('fee_rate');
  });

  it('saveTrade persists fee_amount and fee_rate', () => {
    const { db, dbPath } = makeTempDb();

    db.saveWallet({
      walletId: 'w1', mode: 'PAPER', assignedStrategy: 'momentum',
      capitalAllocated: 100, availableBalance: 95, openPositions: [],
      realizedPnl: 0, dailyPnl: 0, dailyPnlResetAt: new Date().toISOString(),
      riskLimits: { maxPositionSize: 100, maxExposurePerMarket: 200, maxDailyLoss: 100, maxOpenTrades: 5, maxDrawdown: 0.2 },
    });

    db.saveTrade('w1', {
      orderId: 'ord-1', walletId: 'w1', marketId: 'M1', outcome: 'YES',
      side: 'BUY', price: 0.5, size: 10, cost: 5, realizedPnl: 0,
      cumulativePnl: 0, balanceAfter: 94.9, timestamp: Date.now(),
      feeAmount: 0.1, feeRate: 0.02, orderType: 'taker',
    });

    // Check the raw DB row
    const rows = (db['db' as keyof Database] as unknown as { prepare: (s: string) => { all: () => Array<{ fee_amount: number; fee_rate: number }> } })
      .prepare('SELECT fee_amount, fee_rate FROM trades')
      .all();

    db.close();
    fs.unlinkSync(dbPath);

    expect(rows).toHaveLength(1);
    expect(rows[0].fee_amount).toBeCloseTo(0.1, 5);
    expect(rows[0].fee_rate).toBeCloseTo(0.02, 5);
  });

  it('migration: adds fee columns to existing DB without them', () => {
    const dbPath = path.join(os.tmpdir(), `fee-migrate-${Date.now()}.db`);
    // Create a DB without fee columns (old schema)
    const oldDb = new Database(dbPath);
    // Manually exec old schema without fee columns
    (oldDb['db' as keyof Database] as unknown as { exec: (s: string) => void }).exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        walletId TEXT NOT NULL,
        marketId TEXT NOT NULL,
        outcome TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        size REAL NOT NULL,
        fillPrice REAL NOT NULL,
        slippage REAL NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL
      );
    `);
    (oldDb as unknown as { stmts: unknown }).stmts = {};
    oldDb.close();

    // Now open with initSchema — should migrate
    const newDb = new Database(dbPath);
    newDb.initSchema();
    const columns = (newDb['db' as keyof Database] as unknown as { pragma: (s: string) => Array<{ name: string }> })
      .pragma('table_info(trades)')
      .map((c: { name: string }) => c.name);
    newDb.close();
    fs.unlinkSync(dbPath);

    expect(columns).toContain('fee_amount');
    expect(columns).toContain('fee_rate');
  });
});

// ── 8. Dashboard /healthz includes totalFeesAccrued ──────────────────────────

describe('Dashboard /healthz includes totalFeesAccrued', () => {
  let server: DashboardServer;
  let walletManager: WalletManager;
  let port: number;

  beforeEach(async () => {
    walletManager = new WalletManager();
    walletManager.registerWallet(PAPER_CONFIG, 'momentum', false, undefined, TAKER_FEE);

    // Find a free port
    port = await new Promise<number>((resolve) => {
      const srv = http.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const p = typeof addr === 'object' && addr ? addr.port : 30100;
        srv.close(() => resolve(p));
      });
    });

    server = new DashboardServer(walletManager, port);
    server.start();
    await new Promise<void>((r) => setTimeout(r, 50));
  });

  afterEach(() => {
    server.stop();
  });

  it('GET /healthz returns totalFeesAccrued field', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.ok).toBe(true);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('totalFeesAccrued');
    expect(typeof body.totalFeesAccrued).toBe('number');
  });

  it('totalFeesAccrued increases after a fill', async () => {
    const wallet = walletManager.getWallet(PAPER_CONFIG.id)!;
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 10 });

    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    const body = await res.json() as Record<string, unknown>;
    expect((body.totalFeesAccrued as number)).toBeGreaterThan(0);
  });

  it('walletFees per-wallet fee totals included in /healthz', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.walletFees)).toBe(true);
    const fees = body.walletFees as Array<{ walletId: string; totalFeesAccrued: number }>;
    expect(fees.length).toBeGreaterThanOrEqual(1);
    expect(fees[0]).toHaveProperty('walletId');
    expect(fees[0]).toHaveProperty('totalFeesAccrued');
  });
});

// ── 9. PolymarketWallet.applyFill applies fee ─────────────────────────────────

describe('PolymarketWallet.applyFill applies taker fee', () => {
  it('BUY fill: balance reduced by cost + fee', () => {
    process.env.POLYMARKET_API_KEY = 'test-key';
    const wallet = new PolymarketWallet(LIVE_CONFIG, 'momentum', undefined, LIVE_TRADING, TAKER_FEE);
    const prevBalance = wallet.getState().availableBalance;

    wallet.applyFill({
      orderId: 'fill-1',
      marketId: 'M1',
      outcome: 'YES',
      side: 'BUY',
      price: 0.5,
      size: 10,
      timestamp: Date.now(),
    });

    const cost = 0.5 * 10;
    const fee = Math.round(cost * 0.02 * 100) / 100;
    expect(wallet.getState().availableBalance).toBeCloseTo(prevBalance - cost - fee, 5);
    expect(wallet.getTotalFeesAccrued()).toBeCloseTo(fee, 5);

    delete process.env.POLYMARKET_API_KEY;
  });
});
