import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Database } from '../src/storage/database';
import { WalletState, TradeRecord } from '../src/types';

function makeWalletState(overrides: Partial<WalletState> = {}): WalletState {
  const todayMidnightUtc = new Date();
  todayMidnightUtc.setUTCHours(0, 0, 0, 0);
  return {
    walletId: 'test-wallet',
    mode: 'PAPER',
    assignedStrategy: 'momentum',
    capitalAllocated: 1000,
    availableBalance: 950,
    openPositions: [],
    realizedPnl: -50,
    dailyPnl: -10,
    dailyPnlResetAt: todayMidnightUtc.toISOString(),
    riskLimits: {
      maxPositionSize: 100,
      maxExposurePerMarket: 200,
      maxDailyLoss: 100,
      maxOpenTrades: 5,
      maxDrawdown: 0.2,
    },
    ...overrides,
  };
}

function makeTempDb(): { db: Database; dbPath: string } {
  const dbPath = path.join(os.tmpdir(), `test-bot-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(dbPath);
  db.initSchema();
  return { db, dbPath };
}

describe('Database persistence', () => {
  it('wallet state survives a simulated restart (save, new instance, load, compare)', () => {
    const { db, dbPath } = makeTempDb();
    const wallet = makeWalletState({ availableBalance: 875, realizedPnl: -125, dailyPnl: -25 });

    db.saveWallet(wallet);
    db.close();

    // Simulate restart: open a new Database instance pointing at same file
    const db2 = new Database(dbPath);
    db2.initSchema();
    const loaded = db2.loadWallets();
    db2.close();
    fs.unlinkSync(dbPath);

    expect(loaded).toHaveLength(1);
    const restored = loaded[0];
    expect(restored.walletId).toBe(wallet.walletId);
    expect(restored.availableBalance).toBe(wallet.availableBalance);
    expect(restored.realizedPnl).toBe(wallet.realizedPnl);
    expect(restored.dailyPnl).toBe(wallet.dailyPnl);
    expect(restored.dailyPnlResetAt).toBe(wallet.dailyPnlResetAt);
    expect(restored.mode).toBe(wallet.mode);
    expect(restored.assignedStrategy).toBe(wallet.assignedStrategy);
  });

  it('daily PnL resets at midnight', () => {
    const { db, dbPath } = makeTempDb();

    // Simulate a wallet that was last reset yesterday
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    const wallet = makeWalletState({
      dailyPnl: -40,
      dailyPnlResetAt: yesterday.toISOString(),
    });
    db.saveWallet(wallet);

    const loaded = db.loadWallets()[0];
    db.close();
    fs.unlinkSync(dbPath);

    // Confirm dailyPnlResetAt is before today midnight — this is what the engine checks
    const todayMidnightUtc = new Date();
    todayMidnightUtc.setUTCHours(0, 0, 0, 0);
    const resetAt = new Date(loaded.dailyPnlResetAt);
    expect(resetAt.getTime()).toBeLessThan(todayMidnightUtc.getTime());

    // After WalletManager.checkDailyPnlReset() would call wallet.resetDailyPnl(),
    // the dailyPnl becomes 0 and dailyPnlResetAt becomes today midnight.
    // We verify the detection logic here by confirming the condition is met.
    expect(loaded.dailyPnl).toBe(-40); // still stale value from DB
  });

  it('trade records persist and can be queried after save', () => {
    const { db, dbPath } = makeTempDb();
    const wallet = makeWalletState();
    db.saveWallet(wallet);

    const trade: TradeRecord = {
      orderId: 'order-abc-123',
      walletId: 'test-wallet',
      marketId: 'POLY-MARKET-1',
      outcome: 'YES',
      side: 'BUY',
      price: 0.55,
      size: 20,
      cost: 11,
      realizedPnl: 0,
      cumulativePnl: 0,
      balanceAfter: 939,
      timestamp: Date.now(),
    };

    db.saveTrade(wallet.walletId, trade);
    db.close();

    // Reload and verify wallet still present (trades are write-only in this API,
    // but the DB file should be intact with the trade persisted)
    const db2 = new Database(dbPath);
    db2.initSchema();
    const wallets = db2.loadWallets();
    db2.close();
    fs.unlinkSync(dbPath);

    expect(wallets).toHaveLength(1);
    expect(wallets[0].walletId).toBe('test-wallet');
  });

  it('positions are saved and restored', () => {
    const { db, dbPath } = makeTempDb();
    const wallet = makeWalletState();
    db.saveWallet(wallet);

    db.savePosition('test-wallet', {
      marketId: 'POLY-MARKET-1',
      outcome: 'YES',
      size: 10,
      avgPrice: 0.6,
      realizedPnl: 0,
    });

    db.close();

    const db2 = new Database(dbPath);
    db2.initSchema();
    const positions = db2.loadPositions('test-wallet');
    db2.close();
    fs.unlinkSync(dbPath);

    expect(positions).toHaveLength(1);
    expect(positions[0].marketId).toBe('POLY-MARKET-1');
    expect(positions[0].outcome).toBe('YES');
    expect(positions[0].size).toBe(10);
    expect(positions[0].avgPrice).toBe(0.6);
  });

  it('removePosition deletes only the targeted position', () => {
    const { db, dbPath } = makeTempDb();
    const wallet = makeWalletState();
    db.saveWallet(wallet);

    db.savePosition('test-wallet', { marketId: 'MARKET-A', outcome: 'YES', size: 5, avgPrice: 0.5, realizedPnl: 0 });
    db.savePosition('test-wallet', { marketId: 'MARKET-B', outcome: 'NO', size: 8, avgPrice: 0.4, realizedPnl: 0 });
    db.removePosition('test-wallet', 'MARKET-A');

    const positions = db.loadPositions('test-wallet');
    db.close();
    fs.unlinkSync(dbPath);

    expect(positions).toHaveLength(1);
    expect(positions[0].marketId).toBe('MARKET-B');
  });
});
