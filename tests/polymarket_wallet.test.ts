import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';
import type { WalletConfig, LiveTradingConfig } from '../src/types';

const baseConfig: WalletConfig = {
  id: 'live-wallet-1',
  mode: 'LIVE',
  strategy: 'momentum',
  capital: 1000,
};

const liveCfg: LiveTradingConfig = {
  maxSingleOrderCost: 50,
  maxPendingOrders: 5,
  maxDailyOrders: 100,
  orderTimeoutSeconds: 120,
  minBalanceReserve: 10,
};

const baseRequest = {
  marketId: 'POLY-MARKET-1',
  outcome: 'YES' as const,
  side: 'BUY' as const,
  price: 0.5,
  size: 10,
};

function makeWallet(overrides: Partial<WalletConfig> = {}): PolymarketWallet {
  return new PolymarketWallet({ ...baseConfig, ...overrides }, 'momentum', undefined, liveCfg);
}

describe('PolymarketWallet.placeOrder', () => {
  beforeEach(() => {
    process.env.POLYMARKET_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.POLYMARKET_API_KEY;
    vi.restoreAllMocks();
  });

  // a. Successful order submission → status: 'submitted'
  it('returns submitted status on successful API response', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ orderID: 'clob-order-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const wallet = makeWallet();
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('submitted');
    expect(result.orderId).toBe('clob-order-123');
    expect(result.filledSize).toBe(0);
    expect(mockFetch).toHaveBeenCalledOnce();
    // Ensure API key is NOT in any logged value (we check fetch call args)
    const [, fetchOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOptions.body as string) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('test-api-key');
  });

  // b. Order rejected by API (400) → status: 'rejected'
  it('returns rejected on 400 response without retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'insufficient margin',
    });
    vi.stubGlobal('fetch', mockFetch);

    const wallet = makeWallet();
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('rejected');
    expect(result.reason).toContain('insufficient margin');
    // Should only be called once — no retry on 4xx
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // c. API server error (500) → retries then returns 'error'
  it('returns error after server error exhausts retries', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
    });
    vi.stubGlobal('fetch', mockFetch);

    const wallet = makeWallet();
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('error');
    // fetchWithRetry with maxRetries=2 should try twice
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // d. Network timeout → status: 'error', reason: 'network failure'
  it('returns error with network failure reason on thrown network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network timeout'));
    vi.stubGlobal('fetch', mockFetch);

    const wallet = makeWallet();
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('error');
    expect(result.reason).toBe('network failure');
    expect(result.orderId).toBeNull();
  });

  // e. Insufficient balance → refuses without API call
  it('refuses order when balance is insufficient', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // capital=1000, but size=100 * price=0.5 = $50, plus reserve $10 = $60 needed, capital=1000 is fine
    // Set capital low so balance < orderCost
    const wallet = makeWallet({ capital: 1 });
    const result = await wallet.placeOrder({ ...baseRequest, size: 10, price: 0.5 }); // cost = $5, balance = $1

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/insufficient balance/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // f. Exceeds MAX_SINGLE_ORDER_COST → refuses without API call
  it('refuses order that exceeds maxSingleOrderCost', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const wallet = makeWallet({ capital: 10000 });
    // price=0.6, size=200 → cost=$120, limit=$50
    const result = await wallet.placeOrder({ ...baseRequest, price: 0.6, size: 200 });

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/maxSingleOrderCost/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // g. Exceeds MAX_PENDING_ORDERS → refuses without API call
  it('refuses order when maxPendingOrders is reached', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const limitCfg: LiveTradingConfig = { ...liveCfg, maxPendingOrders: 2 };
    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, limitCfg);
    // Inject a mock tracker that reports 2 pending orders (at the limit)
    wallet.setOrderTracker({ getPendingForWallet: () => ['order-1', 'order-2'] });

    const result = await wallet.placeOrder(baseRequest);
    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/maxPendingOrders/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('accepts order when pending count is below maxPendingOrders', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ orderID: 'new-order' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const limitCfg: LiveTradingConfig = { ...liveCfg, maxPendingOrders: 3 };
    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, limitCfg);
    wallet.setOrderTracker({ getPendingForWallet: () => ['order-1', 'order-2'] }); // 2 < 3

    const result = await wallet.placeOrder(baseRequest);
    expect(result.status).toBe('submitted');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // h. Below min_balance_reserve → refuses without API call
  it('refuses order that would breach minBalanceReserve', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // capital=20, orderCost=15 (price=0.5 * size=30), reserve=10
    // balance(20) - cost(15) = 5 < reserve(10) → refuse
    const wallet = makeWallet({ capital: 20 });
    const result = await wallet.placeOrder({ ...baseRequest, price: 0.5, size: 30 });

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/minBalanceReserve/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // i. API key not set → refuses without API call
  it('refuses order when POLYMARKET_API_KEY is not set', async () => {
    delete process.env.POLYMARKET_API_KEY;
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const wallet = makeWallet();
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/API key not set/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('increments daily order count on successful submission', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ orderID: 'order-abc' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const wallet = makeWallet();
    expect(wallet.getDailyOrderCount()).toBe(0);
    await wallet.placeOrder(baseRequest);
    expect(wallet.getDailyOrderCount()).toBe(1);
  });
});

describe('PolymarketWallet balance reservation', () => {
  beforeEach(() => {
    process.env.POLYMARKET_API_KEY = 'test-api-key';
  });
  afterEach(() => {
    delete process.env.POLYMARKET_API_KEY;
    vi.restoreAllMocks();
  });

  it('reserves balance on submit and getAvailableBalance reflects it', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ orderID: 'order-1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    // capital=1000, order cost = 0.5 * 10 = 5
    expect(wallet.getAvailableBalance()).toBe(1000);
    await wallet.placeOrder(baseRequest); // cost=5, should reserve 5
    expect(wallet.getAvailableBalance()).toBe(995);
  });

  it('releases reservation on CLOB rejection (4xx)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    });
    vi.stubGlobal('fetch', mockFetch);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    expect(wallet.getAvailableBalance()).toBe(1000);
    await wallet.placeOrder(baseRequest);
    expect(wallet.getAvailableBalance()).toBe(1000); // released
  });

  it('releases reservation on server error (5xx)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    });
    vi.stubGlobal('fetch', mockFetch);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    await wallet.placeOrder(baseRequest);
    expect(wallet.getAvailableBalance()).toBe(1000);
  });

  it('releases reservation on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', mockFetch);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    await wallet.placeOrder(baseRequest);
    expect(wallet.getAvailableBalance()).toBe(1000);
  });

  it('releases reservation on confirmed fill via applyFill', () => {
    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    wallet.reserveBalance(5); // simulate reservation from placeOrder
    expect(wallet.getAvailableBalance()).toBe(995);

    wallet.applyFill({
      orderId: 'order-1',
      marketId: 'MARKET-1',
      outcome: 'YES',
      side: 'BUY',
      price: 0.5,
      size: 10,
      timestamp: Date.now(),
    });
    // reservation released, balance decremented by fill cost
    expect(wallet.getAvailableBalance()).toBe(995); // balance=995, reserved=0
  });

  it('prevents double-spend: second order rejected when reserved funds cover balance', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ orderID: 'order-1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // capital=15, reserve=10, order cost=5
    // First order: available=15, cost=5, after reserve: available=10 (still >= reserve of 10)
    // Actually: available(15) - cost(5) = 10 which equals reserve(10) — NOT less than reserve
    // So first passes. Second order: available=10, cost=5, 10-5=5 < 10 reserve → refused

    const tightCfg: LiveTradingConfig = { ...liveCfg, minBalanceReserve: 10, maxSingleOrderCost: 50 };
    const wallet = new PolymarketWallet({ ...baseConfig, capital: 15 }, 'momentum', undefined, tightCfg);

    const req = { ...baseRequest, price: 0.5, size: 10 }; // cost = 5
    const first = await wallet.placeOrder(req);
    expect(first.status).toBe('submitted');
    expect(wallet.getAvailableBalance()).toBe(10); // 15 - 5 reserved

    const second = await wallet.placeOrder(req); // available=10, cost=5, 10-5=5 < reserve=10
    expect(second.status).toBe('rejected');
    expect(second.reason).toMatch(/minBalanceReserve/);
  });
});

describe('PolymarketWallet reconcileBalance', () => {
  beforeEach(() => {
    process.env.POLYMARKET_API_KEY = 'test-api-key';
  });
  afterEach(() => {
    delete process.env.POLYMARKET_API_KEY;
    vi.restoreAllMocks();
  });

  it('logs warning when on-chain balance differs from expected by more than 1 USDC', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // On-chain: 500 USDC, bot tracks 1000 — diff=500 > 1 → warn
    const onChainRaw = BigInt(Math.round(500 * 1e6));
    const hexBalance = `0x${onChainRaw.toString(16).padStart(64, '0')}`;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: hexBalance }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Spy on logger.warn directly
    const { logger } = await import('../src/reporting/logs');
    const logWarnSpy = vi.spyOn(logger, 'warn');

    const wallet = new PolymarketWallet(
      { ...baseConfig, capital: 1000, walletAddress: '0xAbCd1234AbCd1234AbCd1234AbCd1234AbCd1234' },
      'momentum',
      undefined,
      liveCfg,
    );

    await wallet.reconcileBalance();

    const warnCalls = logWarnSpy.mock.calls;
    const reconcileWarn = warnCalls.find((args) => {
      const msg = args[args.length - 1];
      return typeof msg === 'string' && msg.includes('reconcileBalance');
    });
    expect(reconcileWarn).toBeDefined();
    warnSpy.mockRestore();
  });

  it('logs nothing when on-chain balance matches expected within 1 USDC', async () => {
    const onChainRaw = BigInt(Math.round(1000 * 1e6));
    const hexBalance = `0x${onChainRaw.toString(16).padStart(64, '0')}`;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: hexBalance }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { logger } = await import('../src/reporting/logs');
    const logWarnSpy = vi.spyOn(logger, 'warn');

    const wallet = new PolymarketWallet(
      { ...baseConfig, capital: 1000, walletAddress: '0xAbCd1234AbCd1234AbCd1234AbCd1234AbCd1234' },
      'momentum',
      undefined,
      liveCfg,
    );

    await wallet.reconcileBalance();

    const warnCalls = logWarnSpy.mock.calls;
    const reconcileWarn = warnCalls.find((args) => {
      const msg = args[args.length - 1];
      return typeof msg === 'string' && msg.includes('reconcileBalance') && msg.includes('differs');
    });
    expect(reconcileWarn).toBeUndefined();
  });

  it('startReconciliation and stopReconciliation control the interval', () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: '0x' + BigInt(Math.round(1000 * 1e6)).toString(16).padStart(64, '0') }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const wallet = new PolymarketWallet(
      { ...baseConfig, capital: 1000, walletAddress: '0xAbCd1234AbCd1234AbCd1234AbCd1234AbCd1234' },
      'momentum',
      undefined,
      liveCfg,
    );

    wallet.startReconciliation(1000);
    vi.advanceTimersByTime(3500);
    wallet.stopReconciliation();
    // Should have fired 3 times (at 1s, 2s, 3s)
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(5000); // after stop, no more calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
