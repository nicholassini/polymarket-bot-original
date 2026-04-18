/**
 * Step 3: Order Isolation Test
 *
 * Verifies that running a paper-wallet strategy cycle emits zero POST requests
 * to CLOB order endpoints, and that no credentials are transmitted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaperWallet } from '../../src/wallets/paper_wallet';
import { TradeExecutor } from '../../src/execution/trade_executor';
import type { OrderRequest } from '../../src/types';
import type { WalletConfig } from '../../src/types';

const paperWalletConfig: WalletConfig = {
  id: 'isolation-paper-wallet',
  mode: 'PAPER',
  strategy: 'momentum',
  capital: 1000,
};

const sampleOrder: OrderRequest = {
  walletId: 'isolation-paper-wallet',
  marketId: 'isolation-market-1',
  outcome: 'YES',
  side: 'BUY',
  price: 0.55,
  size: 5,
  strategy: 'momentum',
};

describe('Order Isolation Test', () => {
  let capturedRequests: Array<{ url: string; method: string; headers: Record<string, string> }>;

  beforeEach(() => {
    capturedRequests = [];

    // Intercept ALL outbound HTTP via global fetch spy
    const spyFetch = vi.fn((url: string, options?: RequestInit) => {
      const method = options?.method ?? 'GET';
      const headers: Record<string, string> = {};
      if (options?.headers) {
        const h = options.headers as Record<string, string>;
        for (const [k, v] of Object.entries(h)) {
          headers[k.toLowerCase()] = v;
        }
      }
      capturedRequests.push({ url, method: method.toUpperCase(), headers });
      // Return a benign OK response so the code doesn't throw
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
      } as Response);
    });
    vi.stubGlobal('fetch', spyFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.POLYMARKET_API_KEY;
    delete process.env.POLYMARKET_API_SECRET;
    delete process.env.POLYMARKET_API_PASSPHRASE;
  });

  // 1. Zero POST requests to any /order endpoint after a paper strategy cycle
  it('emits ZERO POST requests during a paper-wallet strategy cycle', async () => {
    const wallet = new PaperWallet(paperWalletConfig, 'momentum');
    const executor = new TradeExecutor(); // no OrderTracker — paper wallets don't need it

    await executor.execute(sampleOrder, wallet);

    const postRequests = capturedRequests.filter((r) => r.method === 'POST');
    expect(postRequests).toHaveLength(0);
  });

  // 2. Zero requests to any /order endpoint (GET or POST)
  it('makes no HTTP requests whatsoever during a paper-wallet fill', async () => {
    const wallet = new PaperWallet(paperWalletConfig, 'momentum');
    const executor = new TradeExecutor();

    const result = await executor.execute(sampleOrder, wallet);

    // Paper wallet fills synchronously — no HTTP calls
    expect(capturedRequests).toHaveLength(0);
    void result; // result is void from executor
  });

  // 3. No requests contain API key, secret, or passphrase headers
  it('transmits zero credential headers during the paper cycle', async () => {
    process.env.POLYMARKET_API_KEY = 'super-secret-key';
    process.env.POLYMARKET_API_SECRET = 'super-secret-secret';
    process.env.POLYMARKET_API_PASSPHRASE = 'super-secret-pass';

    const wallet = new PaperWallet(paperWalletConfig, 'momentum');
    const executor = new TradeExecutor();

    await executor.execute(sampleOrder, wallet);

    // Check no captured request leaks credentials
    for (const req of capturedRequests) {
      const headerValues = Object.values(req.headers).join(' ');
      expect(headerValues).not.toContain('super-secret-key');
      expect(headerValues).not.toContain('super-secret-secret');
      expect(headerValues).not.toContain('super-secret-pass');

      // Also check standard auth header names are absent
      expect(req.headers['authorization']).toBeUndefined();
      expect(req.headers['poly-api-key']).toBeUndefined();
    }
  });

  // 4. Any GET requests to CLOB are read-only (no /order path)
  it('GET requests (if any) do not touch /order endpoints', async () => {
    const wallet = new PaperWallet(paperWalletConfig, 'momentum');
    const executor = new TradeExecutor();

    // Run multiple orders
    for (let i = 0; i < 3; i++) {
      await executor.execute({ ...sampleOrder, marketId: `market-${i}` }, wallet);
    }

    const orderEndpointRequests = capturedRequests.filter((r) =>
      r.url.includes('/order'),
    );
    expect(orderEndpointRequests).toHaveLength(0);
  });

  // 5. Paper wallet placeOrder returns 'filled' (not 'submitted') — confirms paper path taken
  it('paper wallet returns status filled, not submitted', async () => {
    const wallet = new PaperWallet(paperWalletConfig, 'momentum');

    const result = await wallet.placeOrder({
      marketId: 'iso-market-x',
      outcome: 'NO',
      side: 'BUY',
      price: 0.4,
      size: 10,
    });

    expect(result.status).toBe('filled');
    expect(result.filledSize).toBe(10);
    expect(result.orderId).not.toBeNull();
    // Confirm fetch was never called
    expect(capturedRequests).toHaveLength(0);
  });
});
