import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';
import type { WalletConfig, LiveTradingConfig } from '../src/types';

// Mock the clob_client module so tests control getClobClient()
vi.mock('../src/utils/clob_client', () => ({
  getClobClient: vi.fn(),
  _resetClobClient: vi.fn(),
  CLOB_API_URL: 'https://clob.polymarket.com',
  getClobHeaders: vi.fn().mockReturnValue({}),
  hasClobApiKey: vi.fn().mockReturnValue(false),
}));

import { getClobClient } from '../src/utils/clob_client';

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
  tokenId: 'token-abc-123',
};

function makeWallet(overrides: Partial<WalletConfig> = {}): PolymarketWallet {
  return new PolymarketWallet({ ...baseConfig, ...overrides }, 'momentum', undefined, liveCfg);
}

function makeMockClient(overrides: Record<string, unknown> = {}) {
  return {
    createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'clob-order-123' }),
    ...overrides,
  };
}

describe('PolymarketWallet.placeOrder', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  // a. Successful order submission → status: 'submitted'
  it('returns submitted status on successful SDK response', async () => {
    const mockClient = makeMockClient();
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    const wallet = makeWallet();
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('submitted');
    expect(result.orderId).toBe('clob-order-123');
    expect(result.filledSize).toBe(0);
    expect(mockClient.createAndPostOrder).toHaveBeenCalledOnce();
    const [orderArg] = mockClient.createAndPostOrder.mock.calls[0] as [Record<string, unknown>];
    expect(orderArg.tokenID).toBe(baseRequest.tokenId);
    expect(orderArg.price).toBe(baseRequest.price);
    expect(orderArg.size).toBe(baseRequest.size);
  });

  // b. Order rejected by CLOB (success=false) → status: 'rejected'
  it('returns rejected when SDK response has success=false', async () => {
    const mockClient = makeMockClient({
      createAndPostOrder: vi.fn().mockResolvedValue({ success: false, errorMsg: 'insufficient margin' }),
    });
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    const wallet = makeWallet();
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('rejected');
    expect(result.reason).toContain('insufficient margin');
    expect(mockClient.createAndPostOrder).toHaveBeenCalledOnce();
  });

  // c. SDK throws → status: 'error'
  it('returns error when SDK throws', async () => {
    const mockClient = makeMockClient({
      createAndPostOrder: vi.fn().mockRejectedValue(new Error('network timeout')),
    });
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    const wallet = makeWallet();
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('error');
    expect(result.reason).toContain('network timeout');
    expect(result.orderId).toBeNull();
  });

  // d. tokenId missing → rejected without SDK call
  it('rejects when tokenId is not provided', async () => {
    const mockClient = makeMockClient();
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    const wallet = makeWallet();
    const { tokenId: _ignored, ...requestWithoutToken } = baseRequest;
    const result = await wallet.placeOrder(requestWithoutToken as typeof baseRequest);

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/tokenId required/);
    expect(mockClient.createAndPostOrder).not.toHaveBeenCalled();
  });

  // e. Insufficient balance → refused before SDK call
  it('refuses order when balance is insufficient', async () => {
    const mockClient = makeMockClient();
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    const wallet = makeWallet({ capital: 1 });
    const result = await wallet.placeOrder(baseRequest); // cost = $5, balance = $1

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/insufficient balance/);
    expect(mockClient.createAndPostOrder).not.toHaveBeenCalled();
  });

  // f. Exceeds MAX_SINGLE_ORDER_COST → refused before SDK call
  it('refuses order that exceeds maxSingleOrderCost', async () => {
    const mockClient = makeMockClient();
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    const wallet = makeWallet({ capital: 10000 });
    // price=0.6, size=200 → cost=$120, limit=$50
    const result = await wallet.placeOrder({ ...baseRequest, price: 0.6, size: 200 });

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/maxSingleOrderCost/);
    expect(mockClient.createAndPostOrder).not.toHaveBeenCalled();
  });

  // g. Exceeds MAX_PENDING_ORDERS → refused before SDK call
  it('refuses order when maxPendingOrders is reached', async () => {
    const mockClient = makeMockClient();
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    const limitCfg: LiveTradingConfig = { ...liveCfg, maxPendingOrders: 2 };
    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, limitCfg);
    wallet.setOrderTracker({ getPendingForWallet: () => ['order-1', 'order-2'] });

    const result = await wallet.placeOrder(baseRequest);
    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/maxPendingOrders/);
    expect(mockClient.createAndPostOrder).not.toHaveBeenCalled();
  });

  it('accepts order when pending count is below maxPendingOrders', async () => {
    const mockClient = makeMockClient();
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    const limitCfg: LiveTradingConfig = { ...liveCfg, maxPendingOrders: 3 };
    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, limitCfg);
    wallet.setOrderTracker({ getPendingForWallet: () => ['order-1', 'order-2'] }); // 2 < 3

    const result = await wallet.placeOrder(baseRequest);
    expect(result.status).toBe('submitted');
    expect(mockClient.createAndPostOrder).toHaveBeenCalledOnce();
  });

  // h. Below min_balance_reserve → refused before SDK call
  it('refuses order that would breach minBalanceReserve', async () => {
    const mockClient = makeMockClient();
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    // capital=20, orderCost=15 (price=0.5 * size=30), reserve=10
    // balance(20) - cost(15) = 5 < reserve(10) → refuse
    const wallet = makeWallet({ capital: 20 });
    const result = await wallet.placeOrder({ ...baseRequest, price: 0.5, size: 30 });

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/minBalanceReserve/);
    expect(mockClient.createAndPostOrder).not.toHaveBeenCalled();
  });

  // i. getClobClient returns null → rejected
  it('refuses order when getClobClient returns null (no private key)', async () => {
    vi.mocked(getClobClient).mockResolvedValue(null as never);

    const wallet = makeWallet();
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/POLYMARKET_PRIVATE_KEY/);
  });

  it('increments daily order count on successful submission', async () => {
    vi.mocked(getClobClient).mockResolvedValue(makeMockClient() as never);

    const wallet = makeWallet();
    expect(wallet.getDailyOrderCount()).toBe(0);
    await wallet.placeOrder(baseRequest);
    expect(wallet.getDailyOrderCount()).toBe(1);
  });
});

describe('PolymarketWallet balance reservation', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('reserves balance on submit and getAvailableBalance reflects it', async () => {
    vi.mocked(getClobClient).mockResolvedValue(makeMockClient({ createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'order-1' }) }) as never);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    expect(wallet.getAvailableBalance()).toBe(1000);
    await wallet.placeOrder(baseRequest); // cost=5, should reserve 5
    expect(wallet.getAvailableBalance()).toBe(995);
  });

  it('releases reservation on SDK rejection (success=false)', async () => {
    vi.mocked(getClobClient).mockResolvedValue(makeMockClient({
      createAndPostOrder: vi.fn().mockResolvedValue({ success: false, errorMsg: 'bad request' }),
    }) as never);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    expect(wallet.getAvailableBalance()).toBe(1000);
    await wallet.placeOrder(baseRequest);
    expect(wallet.getAvailableBalance()).toBe(1000); // released
  });

  it('releases reservation on SDK error (throws)', async () => {
    vi.mocked(getClobClient).mockResolvedValue(makeMockClient({
      createAndPostOrder: vi.fn().mockRejectedValue(new Error('server error')),
    }) as never);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    await wallet.placeOrder(baseRequest);
    expect(wallet.getAvailableBalance()).toBe(1000);
  });

  it('releases reservation when getClobClient returns null', async () => {
    vi.mocked(getClobClient).mockResolvedValue(null as never);

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
    vi.mocked(getClobClient).mockResolvedValue(makeMockClient({ createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'order-1' }) }) as never);

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs warning when on-chain balance differs from expected by more than 1 pUSD', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // On-chain: 500 pUSD (18 decimals), bot tracks 1000 — diff=500 > 1 → warn
    const onChainRaw = BigInt(Math.round(500 * 1e18));
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
      return typeof msg === 'string' && msg.includes('reconcileBalance');
    });
    expect(reconcileWarn).toBeDefined();
    warnSpy.mockRestore();
  });

  it('logs nothing when on-chain balance matches expected within 1 pUSD', async () => {
    // 1000 pUSD = 1000 * 10^18 raw
    const onChainRaw = BigInt('1000000000000000000000'); // 1000 * 1e18
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
    // pUSD: 1000 * 1e18
    const onChainRaw = BigInt('1000000000000000000000');
    const hexBalance = `0x${onChainRaw.toString(16).padStart(64, '0')}`;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: hexBalance }),
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
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(5000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe('PolymarketWallet — double-debit prevention', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('does not debit gross balance at submission — reservation only', async () => {
    vi.mocked(getClobClient).mockResolvedValue(makeMockClient({ createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'order-1' }) }) as never);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    const result = await wallet.placeOrder(baseRequest); // cost = 0.5 * 10 = 5

    expect(result.status).toBe('submitted');
    expect(wallet.getState().availableBalance).toBe(1000); // gross NOT decremented
    expect(wallet.getAvailableBalance()).toBe(995); // effective = gross - reserved
  });

  it('debits balance exactly once via applyFill after submission', async () => {
    vi.mocked(getClobClient).mockResolvedValue(makeMockClient({ createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'order-1' }) }) as never);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    const result = await wallet.placeOrder(baseRequest); // cost = 5, reserved

    wallet.applyFill({
      orderId: result.orderId!,
      marketId: baseRequest.marketId,
      outcome: baseRequest.outcome,
      side: baseRequest.side,
      price: baseRequest.price,
      size: baseRequest.size,
      timestamp: Date.now(),
    });

    expect(wallet.getState().availableBalance).toBe(995);
    expect(wallet.getAvailableBalance()).toBe(995); // reserved = 0
  });

  it('releases reservation and restores balance to full on cancel', async () => {
    vi.mocked(getClobClient).mockResolvedValue(makeMockClient({ createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'order-1' }) }) as never);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    await wallet.placeOrder(baseRequest); // cost = 5, reserved

    expect(wallet.getAvailableBalance()).toBe(995);

    const cost = baseRequest.price * baseRequest.size; // 5
    wallet.releaseBalance(cost);

    expect(wallet.getState().availableBalance).toBe(1000);
    expect(wallet.getAvailableBalance()).toBe(1000);
  });

  it('debits only filled portion on partial fill, keeps remainder reserved', async () => {
    vi.mocked(getClobClient).mockResolvedValue(makeMockClient({ createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'order-1' }) }) as never);

    const wallet = new PolymarketWallet(baseConfig, 'momentum', undefined, liveCfg);
    await wallet.placeOrder(baseRequest); // full order: size=10, cost=5, reserved=5

    wallet.applyFill({
      orderId: 'order-1',
      marketId: baseRequest.marketId,
      outcome: baseRequest.outcome,
      side: baseRequest.side,
      price: 0.5,
      size: 6,
      timestamp: Date.now(),
    });

    // 6 shares filled: releaseReservation(3) + balance -= 3 (fee=0)
    expect(wallet.getState().availableBalance).toBe(997); // 1000 - 3
    expect(wallet.getAvailableBalance()).toBe(995);       // 997 - 2

    wallet.releaseBalance(0.5 * 4); // release remaining 4-share reservation
    expect(wallet.getState().availableBalance).toBe(997);
    expect(wallet.getAvailableBalance()).toBe(997);
  });
});
