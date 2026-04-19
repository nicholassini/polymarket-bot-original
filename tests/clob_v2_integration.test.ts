/**
 * CLOB V2 Integration Tests
 * All SDK calls are mocked — no real API calls are made.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock both the SDK and ethers so no real credentials are needed
vi.mock('@polymarket/clob-client-v2', () => {
  const mockClient = {
    createOrDeriveApiKey: vi.fn().mockResolvedValue({ key: 'k', secret: 's', passphrase: 'p' }),
    getServerTime: vi.fn().mockResolvedValue(Date.now()),
    createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'sdk-order-1' }),
    getOrder: vi.fn().mockResolvedValue({ status: 'UNMATCHED', size_matched: '0', price: '0.5' }),
    cancelOrder: vi.fn().mockResolvedValue({ success: true }),
  };
  return {
    ClobClient: vi.fn().mockImplementation(() => mockClient),
    Chain: { POLYGON: 137 },
    Side: { BUY: 'BUY', SELL: 'SELL' },
    OrderType: { GTC: 'GTC' },
  };
});

vi.mock('ethers', () => ({
  Wallet: vi.fn().mockImplementation(() => ({
    address: '0xTestAddress',
    _signTypedData: vi.fn(),
    getAddress: vi.fn().mockResolvedValue('0xTestAddress'),
  })),
}));

import { getClobClient, _resetClobClient } from '../src/utils/clob_client';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';
import { validateLiveCredentials } from '../src/core/config_validator';
import type { WalletConfig, LiveTradingConfig } from '../src/types';

// We also need to mock getClobClient in the modules that import it
vi.mock('../src/utils/clob_client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/clob_client')>();
  return {
    ...actual,
    getClobClient: vi.fn(),
    _resetClobClient: vi.fn(),
  };
});

const liveCfg: LiveTradingConfig = {
  maxSingleOrderCost: 100,
  maxPendingOrders: 5,
  maxDailyOrders: 100,
  orderTimeoutSeconds: 120,
  minBalanceReserve: 0,
};

const walletConfig: WalletConfig = {
  id: 'v2-test-wallet',
  mode: 'LIVE',
  strategy: 'momentum',
  capital: 1000,
};

const baseRequest = {
  marketId: 'POLY-MARKET-V2',
  outcome: 'YES' as const,
  side: 'BUY' as const,
  price: 0.6,
  size: 10,
  tokenId: 'v2-token-yes-001',
};

describe('getClobClient() behavior', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('placeOrder rejects when getClobClient returns null (no private key)', async () => {
    vi.mocked(getClobClient).mockResolvedValue(null as never);

    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, liveCfg);
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/POLYMARKET_PRIVATE_KEY/);
  });

  it('placeOrder proceeds when getClobClient returns a valid client', async () => {
    vi.mocked(getClobClient).mockResolvedValue({
      createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'ok-order' }),
    } as never);

    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, liveCfg);
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('submitted');
    expect(result.orderId).toBe('ok-order');
  });
});

describe('PolymarketWallet V2 order submission', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('calls createAndPostOrder with correct tokenID, price, size, side', async () => {
    const mockCreateAndPost = vi.fn().mockResolvedValue({ orderID: 'sdk-order-1' });
    const mockClient = { createAndPostOrder: mockCreateAndPost };
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, liveCfg);
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('submitted');
    expect(result.orderId).toBe('sdk-order-1');

    const [orderArg, optionsArg, orderTypeArg] = mockCreateAndPost.mock.calls[0] as [
      { tokenID: string; price: number; size: number; side: string },
      { tickSize: string },
      string,
    ];
    expect(orderArg.tokenID).toBe(baseRequest.tokenId);
    expect(orderArg.price).toBe(baseRequest.price);
    expect(orderArg.size).toBe(baseRequest.size);
    expect(orderArg.side).toBe('BUY');
    expect(optionsArg.tickSize).toBe('0.01');
    expect(orderTypeArg).toBe('GTC');
  });

  it('maps SDK response orderID to OrderPlacementResult.orderId', async () => {
    vi.mocked(getClobClient).mockResolvedValue({
      createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'my-sdk-order-xyz' }),
    } as never);

    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, liveCfg);
    const result = await wallet.placeOrder(baseRequest);

    expect(result.orderId).toBe('my-sdk-order-xyz');
    expect(result.filledSize).toBe(0);
  });

  it('maps success=false SDK response to rejected status', async () => {
    vi.mocked(getClobClient).mockResolvedValue({
      createAndPostOrder: vi.fn().mockResolvedValue({ success: false, errorMsg: 'price out of range' }),
    } as never);

    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, liveCfg);
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('rejected');
    expect(result.reason).toContain('price out of range');
  });

  it('rejects without SDK call when getClobClient returns null', async () => {
    const mockCreateAndPost = vi.fn();
    vi.mocked(getClobClient).mockResolvedValue(null as never);

    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, liveCfg);
    const result = await wallet.placeOrder(baseRequest);

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/POLYMARKET_PRIVATE_KEY/);
    expect(mockCreateAndPost).not.toHaveBeenCalled();
  });
});

describe('reconcileBalance() — pUSD (18 decimals)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses pUSD address (0xC011...) in RPC call', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: '0x' + BigInt('1000000000000000000000').toString(16).padStart(64, '0') }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const wallet = new PolymarketWallet(
      { ...walletConfig, walletAddress: '0xAbCd1234AbCd1234AbCd1234AbCd1234AbCd1234' },
      'momentum',
      undefined,
      liveCfg,
    );

    await wallet.reconcileBalance();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { params: [{ to: string }] };
    expect(body.params[0].to).toBe('0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB');
  });

  it('divides raw balance by 1e18 (18 decimals)', async () => {
    // 500 pUSD = 500 * 1e18 raw
    const rawBalance = BigInt(500) * BigInt('1000000000000000000');
    const hexBalance = '0x' + rawBalance.toString(16).padStart(64, '0');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: hexBalance }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { logger } = await import('../src/reporting/logs');
    const warnSpy = vi.spyOn(logger, 'warn');

    const wallet = new PolymarketWallet(
      { ...walletConfig, capital: 1000, walletAddress: '0xAbCd1234AbCd1234AbCd1234AbCd1234AbCd1234' },
      'momentum',
      undefined,
      liveCfg,
    );

    await wallet.reconcileBalance();

    // on-chain=500, expected=1000 → diff=500 > 1 → warn logged
    const reconcileWarn = warnSpy.mock.calls.find((args) => {
      const msg = args[args.length - 1];
      return typeof msg === 'string' && msg.includes('reconcileBalance');
    });
    expect(reconcileWarn).toBeDefined();
    const meta = reconcileWarn![0] as { onChain: number };
    expect(meta.onChain).toBeCloseTo(500, 2);
  });
});

describe('validateLiveCredentials() — V2', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('throws when getClobClient returns null', async () => {
    vi.mocked(getClobClient).mockResolvedValue(null as never);

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .rejects.toThrow(/getClobClient.*returned null/);
  });

  it('throws when getServerTime fails', async () => {
    vi.mocked(getClobClient).mockResolvedValue({
      getServerTime: vi.fn().mockRejectedValue(new Error('timeout')),
    } as never);

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .rejects.toThrow(/CLOB V2 connectivity check failed/);
  });

  it('resolves when getServerTime succeeds', async () => {
    vi.mocked(getClobClient).mockResolvedValue({
      getServerTime: vi.fn().mockResolvedValue(Date.now()),
    } as never);

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .resolves.toBeUndefined();
  });
});
