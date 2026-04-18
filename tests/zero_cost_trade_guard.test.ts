/**
 * Tests for the zero-cost/zero-size trade guard added in TradingDB.saveTrade()
 * and PaperWallet.placeOrder() (post-overnight-audit fix).
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TradingDB } from '../src/storage/trading_db';
import { PaperWallet } from '../src/wallets/paper_wallet';
import type { TradeRecord, WalletConfig } from '../src/types';

function makeTempTradingDb(): { db: TradingDB; dbPath: string } {
  const dbPath = path.join(
    os.tmpdir(),
    `zero-cost-guard-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = new TradingDB(dbPath);
  return { db, dbPath };
}

function makeTradeRecord(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    orderId: `order-${Date.now()}`,
    walletId: 'test-wallet',
    marketId: 'MARKET-1',
    outcome: 'YES',
    side: 'BUY',
    price: 0.5,
    size: 10,
    cost: 5,
    realizedPnl: 0,
    cumulativePnl: 0,
    balanceAfter: 95,
    timestamp: Date.now(),
    feeAmount: 0,
    feeRate: 0,
    ...overrides,
  };
}

// ── TradingDB.saveTrade() guard ───────────────────────────────────────────────

describe('TradingDB.saveTrade: zero-cost guard', () => {
  it('persists a valid trade with size > 0 and cost > 0', () => {
    const { db, dbPath } = makeTempTradingDb();
    const trade = makeTradeRecord({ size: 10, cost: 5 });
    db.saveTrade(trade);
    const loaded = db.loadTrades('test-wallet');
    db.close();
    fs.unlinkSync(dbPath);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].orderId).toBe(trade.orderId);
  });

  it('rejects a trade with size === 0 (does not insert)', () => {
    const { db, dbPath } = makeTempTradingDb();
    const zeroSize = makeTradeRecord({ size: 0, cost: 0 });
    db.saveTrade(zeroSize);
    const loaded = db.loadTrades('test-wallet');
    db.close();
    fs.unlinkSync(dbPath);

    expect(loaded).toHaveLength(0);
  });

  it('rejects a trade with size < 0', () => {
    const { db, dbPath } = makeTempTradingDb();
    db.saveTrade(makeTradeRecord({ size: -1, cost: -0.5 }));
    const loaded = db.loadTrades('test-wallet');
    db.close();
    fs.unlinkSync(dbPath);

    expect(loaded).toHaveLength(0);
  });

  it('rejects a trade with cost === 0 even if size > 0', () => {
    const { db, dbPath } = makeTempTradingDb();
    db.saveTrade(makeTradeRecord({ size: 5, cost: 0 }));
    const loaded = db.loadTrades('test-wallet');
    db.close();
    fs.unlinkSync(dbPath);

    expect(loaded).toHaveLength(0);
  });

  it('valid trades after rejected ones are still inserted', () => {
    const { db, dbPath } = makeTempTradingDb();
    db.saveTrade(makeTradeRecord({ orderId: 'bad-1', size: 0, cost: 0 }));
    db.saveTrade(makeTradeRecord({ orderId: 'good-1', size: 5, cost: 2.5 }));
    db.saveTrade(makeTradeRecord({ orderId: 'bad-2', size: 0, cost: 0 }));
    db.saveTrade(makeTradeRecord({ orderId: 'good-2', size: 3, cost: 1.5 }));
    const loaded = db.loadTrades('test-wallet');
    db.close();
    fs.unlinkSync(dbPath);

    expect(loaded).toHaveLength(2);
    expect(loaded.map((t) => t.orderId)).toEqual(
      expect.arrayContaining(['good-1', 'good-2']),
    );
  });
});

// ── Fee column migration ──────────────────────────────────────────────────────

describe('TradingDB: fee column migration', () => {
  it('fee_amount and fee_rate columns exist after construction', () => {
    const { db, dbPath } = makeTempTradingDb();
    // Access underlying DB via a public-test-only backdoor isn't available,
    // so we validate by inserting a trade with fee fields and reloading them.
    db.saveTrade(makeTradeRecord({ size: 10, cost: 5, feeAmount: 0.1, feeRate: 0.02 }));
    const loaded = db.loadTrades('test-wallet');
    db.close();
    fs.unlinkSync(dbPath);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].feeAmount).toBeCloseTo(0.1, 5);
    expect(loaded[0].feeRate).toBeCloseTo(0.02, 5);
  });

  it('fee fields default to 0 when not provided', () => {
    const { db, dbPath } = makeTempTradingDb();
    const trade = makeTradeRecord({ size: 10, cost: 5 });
    delete (trade as Partial<TradeRecord>).feeAmount;
    delete (trade as Partial<TradeRecord>).feeRate;
    db.saveTrade(trade);
    const loaded = db.loadTrades('test-wallet');
    db.close();
    fs.unlinkSync(dbPath);

    expect(loaded[0].feeAmount).toBe(0);
    expect(loaded[0].feeRate).toBe(0);
  });
});

// ── PaperWallet.placeOrder() size guard ──────────────────────────────────────

describe('PaperWallet.placeOrder: zero-size guard', () => {
  const config: WalletConfig = {
    id: 'guard-test-wallet',
    mode: 'PAPER',
    strategy: 'momentum',
    capital: 100,
  };

  it('does not record a trade when size === 0', async () => {
    const wallet = new PaperWallet(config, 'momentum');
    const balanceBefore = wallet.getState().availableBalance;
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 0 });

    expect(wallet.getTradeHistory()).toHaveLength(0);
    expect(wallet.getState().availableBalance).toBe(balanceBefore);
  });

  it('does not record a trade when size < 0', async () => {
    const wallet = new PaperWallet(config, 'momentum');
    const balanceBefore = wallet.getState().availableBalance;
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: -5 });

    expect(wallet.getTradeHistory()).toHaveLength(0);
    expect(wallet.getState().availableBalance).toBe(balanceBefore);
  });

  it('records a valid trade when size > 0', async () => {
    const wallet = new PaperWallet(config, 'momentum');
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 5 });

    expect(wallet.getTradeHistory()).toHaveLength(1);
    expect(wallet.getTradeHistory()[0].size).toBe(5);
  });

  it('balance is unchanged after a zero-size order attempt', async () => {
    const wallet = new PaperWallet(config, 'momentum');
    const before = wallet.getState().availableBalance;
    await wallet.placeOrder({ marketId: 'M1', outcome: 'YES', side: 'BUY', price: 0.5, size: 0 });
    expect(wallet.getState().availableBalance).toBe(before);
  });
});
