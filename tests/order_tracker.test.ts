import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { OrderTracker } from '../src/execution/order_tracker';
import { Database } from '../src/storage/database';
import { WalletManager } from '../src/wallets/wallet_manager';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';
import type { PendingOrder } from '../src/types/order';
import type { WalletConfig, LiveTradingConfig, OrderFill } from '../src/types';

const liveCfg: LiveTradingConfig = {
  maxSingleOrderCost: 50,
  maxPendingOrders: 5,
  maxDailyOrders: 100,
  orderTimeoutSeconds: 120,
  minBalanceReserve: 10,
};

const walletConfig: WalletConfig = {
  id: 'live-wallet-1',
  mode: 'LIVE',
  strategy: 'momentum',
  capital: 1000,
};

function makeTempDb(): { db: Database; dbPath: string } {
  const dbPath = path.join(os.tmpdir(), `tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(dbPath);
  db.initSchema();
  return { db, dbPath };
}

function makePendingOrder(overrides: Partial<PendingOrder> = {}): PendingOrder {
  return {
    orderId: 'order-abc-123',
    walletId: 'live-wallet-1',
    submission: {
      marketId: 'POLY-MARKET-1',
      outcome: 'YES',
      side: 'BUY',
      price: 0.5,
      size: 10,
    },
    submittedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    checkCount: 0,
    ...overrides,
  };
}

describe('OrderTracker', () => {
  let db: Database;
  let dbPath: string;
  let walletManager: WalletManager;
  let wallet: PolymarketWallet;

  beforeEach(() => {
    process.env.POLYMARKET_API_KEY = 'test-key';
    ({ db, dbPath } = makeTempDb());
    walletManager = new WalletManager(db);
    wallet = new PolymarketWallet(walletConfig, 'momentum', db, liveCfg);
    // Pre-save wallet row so FK constraints pass when saveTrade is called
    db.saveWallet(wallet.getState());
    walletManager.registerExternalWallet(walletConfig.id, wallet);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    delete process.env.POLYMARKET_API_KEY;
    vi.restoreAllMocks();
  });

  // a. Order confirmed filled → applyFill called, trade persisted, removed from pending
  it('applies fill and removes from pending when CLOB reports MATCHED', async () => {
    const applyFillSpy = vi.spyOn(wallet, 'applyFill');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'MATCHED', size_matched: 10, price: 0.5 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const tracker = new OrderTracker(db, walletManager, 'test-key');
    const order = makePendingOrder();
    tracker.addPendingOrder(order);
    expect(tracker.getPendingCount()).toBe(1);

    // Trigger a poll cycle manually
    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    expect(applyFillSpy).toHaveBeenCalledOnce();
    const fill = applyFillSpy.mock.calls[0][0] as OrderFill;
    expect(fill.orderId).toBe(order.orderId);
    expect(fill.size).toBe(10);
    expect(tracker.getPendingCount()).toBe(0);
    expect(db.loadPendingOrders()).toHaveLength(0);
  });

  // b. Order confirmed rejected → logged, removed from pending, no balance change
  it('removes cancelled orders without applying fill', async () => {
    const applyFillSpy = vi.spyOn(wallet, 'applyFill');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'CANCELLED' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const tracker = new OrderTracker(db, walletManager, 'test-key');
    const order = makePendingOrder();
    tracker.addPendingOrder(order);

    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    expect(applyFillSpy).not.toHaveBeenCalled();
    expect(tracker.getPendingCount()).toBe(0);
    const balanceAfter = wallet.getState().availableBalance;
    expect(balanceAfter).toBe(1000); // unchanged
  });

  // c. Partial fill → partial applyFill, order remains in pending with reduced size
  it('applies partial fill and keeps order in pending with reduced size', async () => {
    const applyFillSpy = vi.spyOn(wallet, 'applyFill');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'PARTIALLY_MATCHED', size_matched: 4, price: 0.5 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const tracker = new OrderTracker(db, walletManager, 'test-key');
    const order = makePendingOrder({ submission: { marketId: 'POLY-MARKET-1', outcome: 'YES', side: 'BUY', price: 0.5, size: 10 } });
    tracker.addPendingOrder(order);

    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    expect(applyFillSpy).toHaveBeenCalledOnce();
    const fill = applyFillSpy.mock.calls[0][0] as OrderFill;
    expect(fill.size).toBe(4); // only partial
    expect(tracker.getPendingCount()).toBe(1); // still tracking remainder
    const remaining = tracker.getPendingForWallet('live-wallet-1');
    expect(remaining[0].submission.size).toBe(6); // 10 - 4
  });

  // d. Order times out → cancel API called, removed from pending, alert sent
  it('cancels and removes timed-out orders', async () => {
    const deleteFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', deleteFetch);

    const tracker = new OrderTracker(db, walletManager, 'test-key');
    tracker.setOrderTimeoutMs(0); // expire immediately

    const oldDate = new Date(Date.now() - 999_999).toISOString();
    const order = makePendingOrder({ submittedAt: oldDate });
    tracker.addPendingOrder(order);

    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    expect(tracker.getPendingCount()).toBe(0);
    expect(db.loadPendingOrders()).toHaveLength(0);
    // DELETE call should have been made
    const [url, opts] = deleteFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(order.orderId);
    expect(opts.method).toBe('DELETE');
  });

  // e. API status check fails → order stays in pending, checkCount incremented
  it('increments checkCount and keeps order on status check failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    vi.stubGlobal('fetch', mockFetch);

    const tracker = new OrderTracker(db, walletManager, 'test-key');
    const order = makePendingOrder();
    tracker.addPendingOrder(order);

    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    expect(tracker.getPendingCount()).toBe(1);
    const pending = tracker.getPendingForWallet('live-wallet-1');
    expect(pending[0].checkCount).toBe(1);
  });

  // f. Pending orders survive restart → save to DB, create new tracker, load from DB
  it('resumes pending orders from DB on start', () => {
    const tracker1 = new OrderTracker(db, walletManager, 'test-key');
    const order = makePendingOrder({ orderId: 'survive-restart-order' });
    tracker1.addPendingOrder(order);
    expect(db.loadPendingOrders()).toHaveLength(1);

    // Simulate restart: new tracker instance
    const tracker2 = new OrderTracker(db, walletManager, 'test-key');
    tracker2.start();
    // stop immediately so no real polling occurs
    tracker2.stop();

    expect(tracker2.getPendingCount()).toBe(1);
    expect(tracker2.getPendingForWallet('live-wallet-1')[0].orderId).toBe('survive-restart-order');
  });

  // g. Stop method cancels all pending orders → cancel API called for each
  it('cancels all pending orders on stop', async () => {
    const deleteFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', deleteFetch);

    const tracker = new OrderTracker(db, walletManager, 'test-key');
    tracker.addPendingOrder(makePendingOrder({ orderId: 'order-1' }));
    tracker.addPendingOrder(makePendingOrder({ orderId: 'order-2', walletId: 'live-wallet-1' }));
    expect(tracker.getPendingCount()).toBe(2);

    tracker.stop();

    // Allow the async cancel calls to be queued (they're fire-and-forget)
    await new Promise((r) => setTimeout(r, 10));

    expect(deleteFetch).toHaveBeenCalledTimes(2);
    const urls = deleteFetch.mock.calls.map(([url]: [string]) => url as string);
    expect(urls.some((u) => u.includes('order-1'))).toBe(true);
    expect(urls.some((u) => u.includes('order-2'))).toBe(true);
  });

  // g2. Poll guard: concurrent poll is skipped with a warning
  it('skips poll and logs warning when previous poll is still running', async () => {
    const { logger } = await import('../src/reporting/logs');
    const logWarnSpy = vi.spyOn(logger, 'warn');

    // Fetch that never resolves — simulates a hung poll
    let resolveFetch!: () => void;
    const hangingFetch = vi.fn().mockReturnValue(
      new Promise<{ ok: boolean; status: number; json: () => Promise<{ status: string }> }>((resolve) => {
        resolveFetch = () => resolve({ ok: true, status: 200, json: async () => ({ status: 'UNMATCHED' }) });
      }),
    );
    vi.stubGlobal('fetch', hangingFetch);

    const tracker = new OrderTracker(db, walletManager, 'test-key');
    const order = makePendingOrder();
    tracker.addPendingOrder(order);

    // Start first poll — it will hang
    const firstPoll = (tracker as unknown as { _doPoll(): Promise<void> })._doPoll();

    // Second poll should be skipped because isPolling=true — but we need to test via pollPendingOrders
    // We do this by setting isPolling=true manually and then calling pollPendingOrders
    (tracker as unknown as { isPolling: boolean }).isPolling = true;
    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    const warnCalls = logWarnSpy.mock.calls;
    const skipWarn = warnCalls.find((args) => {
      const msg = args[args.length - 1];
      return typeof msg === 'string' && msg.includes('skipping');
    });
    expect(skipWarn).toBeDefined();

    // Clean up: resolve the hanging fetch and reset isPolling
    (tracker as unknown as { isPolling: boolean }).isPolling = false;
    resolveFetch();
    await firstPoll;
  });

  // h. Daily order limit enforced via PolymarketWallet
  it('placeOrder is refused after daily order limit is reached', async () => {
    const zeroLimitCfg: LiveTradingConfig = { ...liveCfg, maxDailyOrders: 1 };
    const limitedWallet = new PolymarketWallet(
      { ...walletConfig, id: 'limited-wallet' },
      'momentum',
      undefined,
      zeroLimitCfg,
    );

    const successFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ orderID: 'order-first' }),
    });
    vi.stubGlobal('fetch', successFetch);

    const req = { marketId: 'MARKET-1', outcome: 'YES' as const, side: 'BUY' as const, price: 0.5, size: 5 };

    const first = await limitedWallet.placeOrder(req);
    expect(first.status).toBe('submitted');
    expect(limitedWallet.getDailyOrderCount()).toBe(1);

    const second = await limitedWallet.placeOrder(req);
    expect(second.status).toBe('rejected');
    expect(second.reason).toMatch(/maxDailyOrders/);
    // fetch should only have been called once (for the first successful order)
    expect(successFetch).toHaveBeenCalledOnce();
  });
});
