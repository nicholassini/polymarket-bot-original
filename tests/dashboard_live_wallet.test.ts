import { describe, it, expect, vi } from 'vitest';
import { DashboardServer } from '../src/reporting/dashboard_server';
import { WalletManager } from '../src/wallets/wallet_manager';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';
import type { LiveTradingConfig, FeeConfig } from '../src/types';

const testLiveCfg: LiveTradingConfig = {
  maxSingleOrderCost: 10,
  maxPendingOrders: 3,
  maxDailyOrders: 20,
  orderTimeoutSeconds: 60,
  minBalanceReserve: 20,
};

const testFeeCfg: FeeConfig = {
  takerFeeRate: 0.02,
  makerFeeRate: 0.0,
};

describe('DashboardServer — live wallet config propagation', () => {
  it('exposes setLiveCfg setter', () => {
    const wm = new WalletManager();
    const server = new DashboardServer(wm, 19999);
    expect(typeof server.setLiveCfg).toBe('function');
  });

  it('setLiveCfg and setFeeCfg do not throw', () => {
    const wm = new WalletManager();
    const server = new DashboardServer(wm, 19999);
    expect(() => {
      server.setLiveCfg(testLiveCfg);
      server.setFeeCfg(testFeeCfg);
    }).not.toThrow();
  });

  it('dashboard-created LIVE wallet respects liveCfg maxSingleOrderCost when set', async () => {
    process.env.POLYMARKET_API_KEY = 'test-key';

    // Simulate how dashboard creates a PolymarketWallet after setLiveCfg is called.
    // The dashboard calls: new PolymarketWallet(walletConfig, strategy, undefined, this.liveCfg, this.feeCfg)
    // Verify that the resulting wallet enforces the configured limit.
    const walletConfig = {
      id: 'dash-live-w1',
      mode: 'LIVE' as const,
      strategy: 'momentum',
      capital: 500,
    };

    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, testLiveCfg, testFeeCfg);

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Order cost = 0.5 * 100 = 50, exceeds maxSingleOrderCost=10 → rejected without fetch call
    const result = await wallet.placeOrder({
      marketId: 'MARKET-1',
      outcome: 'YES',
      side: 'BUY',
      price: 0.5,
      size: 100,
    });

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/maxSingleOrderCost/);
    expect(mockFetch).not.toHaveBeenCalled();

    delete process.env.POLYMARKET_API_KEY;
    vi.restoreAllMocks();
  });

  it('dashboard-created LIVE wallet with DEFAULT liveCfg allows large orders (bug scenario)', async () => {
    process.env.POLYMARKET_API_KEY = 'test-key';

    // Without fix: new PolymarketWallet(walletConfig, strategy) uses DEFAULT_LIVE_CFG (maxSingleOrderCost=100)
    // This allows orders up to $100 even if config.yaml sets a lower limit
    const walletConfig = {
      id: 'dash-live-w2',
      mode: 'LIVE' as const,
      strategy: 'momentum',
      capital: 5000,
    };

    const defaultWallet = new PolymarketWallet(walletConfig, 'momentum');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ orderID: 'order-1' }),
    }));

    // $50 order would be blocked by testLiveCfg (max=$10) but allowed by DEFAULT ($100)
    const resultDefault = await defaultWallet.placeOrder({
      marketId: 'MARKET-1', outcome: 'YES', side: 'BUY', price: 0.5, size: 100,
    });
    // DEFAULT allows up to $100, cost=50 → submitted
    expect(resultDefault.status).toBe('submitted');

    delete process.env.POLYMARKET_API_KEY;
    vi.restoreAllMocks();
  });
});
