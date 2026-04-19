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
import type { ClobClient } from '@polymarket/clob-client-v2';

// Mock the clob_client module (PolymarketWallet imports it)
vi.mock('../src/utils/clob_client', () => ({
  getClobClient: vi.fn().mockResolvedValue(null),
  _resetClobClient: vi.fn(),
  CLOB_API_URL: 'https://clob.polymarket.com',
  getClobHeaders: vi.fn().mockReturnValue({}),
  hasClobApiKey: vi.fn().mockReturnValue(false),
}));

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

/** Build a minimal mock ClobClient for OrderTracker */
function makeMockClobClient(overrides: Partial<{
  getOrder: ReturnType<typeof vi.fn>;
  cancelOrder: ReturnType<typeof vi.fn>;
}> = {}): ClobClient {
  return {
    getOrder: vi.fn().mockResolvedValue({ status: 'UNMATCHED', size_matched: '0', price: '0.5' }),
    cancelOrder: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  } as unknown as ClobClient;
}

describe('OrderTracker', () => {
  let db: Database;
  let dbPath: string;
  let walletManager: WalletManager;
  let wallet: PolymarketWallet;
  let mockClient: ClobClient;

  beforeEach(() => {
    ({ db, dbPath } = makeTempDb());
    walletManager = new WalletManager(db);
    wallet = new PolymarketWallet(walletConfig, 'momentum', db, liveCfg);
    db.saveWallet(wallet.getState());
    walletManager.registerExternalWallet(walletConfig.id, wallet);
    mockClient = makeMockClobClient();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    vi.resetAllMocks();
  });

  // a. Order confirmed filled → applyFill called, trade persisted, removed from pending
  it('applies fill and removes from pending when CLOB reports MATCHED', async () => {
    const applyFillSpy = vi.spyOn(wallet, 'applyFill');
    mockClient = makeMockClobClient({
      getOrder: vi.fn().mockResolvedValue({ status: 'MATCHED', size_matched: '10', price: '0.5' }),
    });

    const tracker = new OrderTracker(db, walletManager, mockClient);
    const order = makePendingOrder();
    tracker.addPendingOrder(order);
    expect(tracker.getPendingCount()).toBe(1);

    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    expect(applyFillSpy).toHaveBeenCalledOnce();
    const fill = applyFillSpy.mock.calls[0][0] as OrderFill;
    expect(fill.orderId).toBe(order.orderId);
    expect(fill.size).toBe(10);
    expect(tracker.getPendingCount()).toBe(0);
    expect(db.loadPendingOrders()).toHaveLength(0);
  });

  // b. Order cancelled → no fill, removed from pending
  it('removes cancelled orders without applying fill', async () => {
    const applyFillSpy = vi.spyOn(wallet, 'applyFill');
    mockClient = makeMockClobClient({
      getOrder: vi.fn().mockResolvedValue({ status: 'CANCELLED', size_matched: '0', price: '0.5' }),
    });

    const tracker = new OrderTracker(db, walletManager, mockClient);
    const order = makePendingOrder();
    tracker.addPendingOrder(order);

    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    expect(applyFillSpy).not.toHaveBeenCalled();
    expect(tracker.getPendingCount()).toBe(0);
    expect(wallet.getState().availableBalance).toBe(1000); // unchanged
  });

  // c. Partial fill → partial applyFill, order remains in pending with reduced size
  it('applies partial fill and keeps order in pending with reduced size', async () => {
    const applyFillSpy = vi.spyOn(wallet, 'applyFill');
    mockClient = makeMockClobClient({
      getOrder: vi.fn().mockResolvedValue({ status: 'PARTIALLY_MATCHED', size_matched: '4', price: '0.5' }),
    });

    const tracker = new OrderTracker(db, walletManager, mockClient);
    const order = makePendingOrder({ submission: { marketId: 'POLY-MARKET-1', outcome: 'YES', side: 'BUY', price: 0.5, size: 10 } });
    tracker.addPendingOrder(order);

    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    expect(applyFillSpy).toHaveBeenCalledOnce();
    const fill = applyFillSpy.mock.calls[0][0] as OrderFill;
    expect(fill.size).toBe(4); // partial
    expect(tracker.getPendingCount()).toBe(1); // still tracking remainder
    const remaining = tracker.getPendingForWallet('live-wallet-1');
    expect(remaining[0].submission.size).toBe(6); // 10 - 4
  });

  // d. Order times out → cancel SDK called, removed from pending
  it('cancels and removes timed-out orders', async () => {
    const cancelSpy = vi.fn().mockResolvedValue({ success: true });
    mockClient = makeMockClobClient({ cancelOrder: cancelSpy });

    const tracker = new OrderTracker(db, walletManager, mockClient);
    tracker.setOrderTimeoutMs(0); // expire immediately

    const oldDate = new Date(Date.now() - 999_999).toISOString();
    const order = makePendingOrder({ submittedAt: oldDate });
    tracker.addPendingOrder(order);

    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    expect(tracker.getPendingCount()).toBe(0);
    expect(db.loadPendingOrders()).toHaveLength(0);
    expect(cancelSpy).toHaveBeenCalledOnce();
    const [payload] = cancelSpy.mock.calls[0] as [{ orderID: string }][];
    expect((payload as unknown as { orderID: string }).orderID).toBe(order.orderId);
  });

  // e. SDK status check throws → order stays in pending, checkCount incremented
  it('increments checkCount and keeps order on status check failure', async () => {
    mockClient = makeMockClobClient({
      getOrder: vi.fn().mockRejectedValue(new Error('network error')),
    });

    const tracker = new OrderTracker(db, walletManager, mockClient);
    const order = makePendingOrder();
    tracker.addPendingOrder(order);

    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    expect(tracker.getPendingCount()).toBe(1);
    const pending = tracker.getPendingForWallet('live-wallet-1');
    expect(pending[0].checkCount).toBe(1);
  });

  // f. Pending orders survive restart → save to DB, create new tracker, load from DB
  it('resumes pending orders from DB on start', () => {
    const tracker1 = new OrderTracker(db, walletManager, mockClient);
    const order = makePendingOrder({ orderId: 'survive-restart-order' });
    tracker1.addPendingOrder(order);
    expect(db.loadPendingOrders()).toHaveLength(1);

    const tracker2 = new OrderTracker(db, walletManager, mockClient);
    tracker2.start();
    tracker2.stop();

    expect(tracker2.getPendingCount()).toBe(1);
    expect(tracker2.getPendingForWallet('live-wallet-1')[0].orderId).toBe('survive-restart-order');
  });

  // g. Stop method cancels all pending orders
  it('cancels all pending orders on stop', async () => {
    const cancelSpy = vi.fn().mockResolvedValue({ success: true });
    mockClient = makeMockClobClient({ cancelOrder: cancelSpy });

    const tracker = new OrderTracker(db, walletManager, mockClient);
    tracker.addPendingOrder(makePendingOrder({ orderId: 'order-1' }));
    tracker.addPendingOrder(makePendingOrder({ orderId: 'order-2', walletId: 'live-wallet-1' }));
    expect(tracker.getPendingCount()).toBe(2);

    tracker.stop();

    await new Promise((r) => setTimeout(r, 10));

    expect(cancelSpy).toHaveBeenCalledTimes(2);
    const orderIds = cancelSpy.mock.calls.map(([payload]: [{ orderID: string }][]) =>
      (payload as unknown as { orderID: string }).orderID);
    expect(orderIds).toContain('order-1');
    expect(orderIds).toContain('order-2');
  });

  // g2. Poll guard: concurrent poll is skipped with a warning
  it('skips poll and logs warning when previous poll is still running', async () => {
    const { logger } = await import('../src/reporting/logs');
    const logWarnSpy = vi.spyOn(logger, 'warn');

    let resolveGetOrder!: () => void;
    mockClient = makeMockClobClient({
      getOrder: vi.fn().mockReturnValue(
        new Promise<{ status: string; size_matched: string; price: string }>((resolve) => {
          resolveGetOrder = () => resolve({ status: 'UNMATCHED', size_matched: '0', price: '0.5' });
        }),
      ),
    });

    const tracker = new OrderTracker(db, walletManager, mockClient);
    const order = makePendingOrder();
    tracker.addPendingOrder(order);

    const firstPoll = (tracker as unknown as { _doPoll(): Promise<void> })._doPoll();

    (tracker as unknown as { isPolling: boolean }).isPolling = true;
    await (tracker as unknown as { pollPendingOrders(): Promise<void> }).pollPendingOrders();

    const warnCalls = logWarnSpy.mock.calls;
    const skipWarn = warnCalls.find((args) => {
      const msg = args[args.length - 1];
      return typeof msg === 'string' && msg.includes('skipping');
    });
    expect(skipWarn).toBeDefined();

    (tracker as unknown as { isPolling: boolean }).isPolling = false;
    resolveGetOrder();
    await firstPoll;
  });

  // h. Daily order limit enforced via PolymarketWallet (no SDK call needed)
  it('placeOrder is refused after daily order limit is reached', async () => {
    const { getClobClient: mockGetClobClient } = await import('../src/utils/clob_client');
    const sdkClient = makeMockClobClient({
      getOrder: vi.fn(),
      createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'order-first' }),
    } as unknown as Partial<{ getOrder: ReturnType<typeof vi.fn>; cancelOrder: ReturnType<typeof vi.fn> }>);
    vi.mocked(mockGetClobClient).mockResolvedValue(sdkClient as never);

    const zeroLimitCfg: LiveTradingConfig = { ...liveCfg, maxDailyOrders: 1 };
    const limitedWallet = new PolymarketWallet(
      { ...walletConfig, id: 'limited-wallet' },
      'momentum',
      undefined,
      zeroLimitCfg,
    );

    const req = { marketId: 'MARKET-1', outcome: 'YES' as const, side: 'BUY' as const, price: 0.5, size: 5, tokenId: 'tok-1' };

    const first = await limitedWallet.placeOrder(req);
    expect(first.status).toBe('submitted');
    expect(limitedWallet.getDailyOrderCount()).toBe(1);

    const second = await limitedWallet.placeOrder(req);
    expect(second.status).toBe('rejected');
    expect(second.reason).toMatch(/maxDailyOrders/);
    expect(sdkClient.getOrder as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
