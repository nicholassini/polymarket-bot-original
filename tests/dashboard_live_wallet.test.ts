import { describe, it, expect, vi, afterEach } from 'vitest';
import { DashboardServer } from '../src/reporting/dashboard_server';
import { WalletManager } from '../src/wallets/wallet_manager';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';
import type { LiveTradingConfig, FeeConfig } from '../src/types';

vi.mock('../src/utils/clob_client', () => ({
  getClobClient: vi.fn(),
  _resetClobClient: vi.fn(),
  CLOB_API_URL: 'https://clob.polymarket.com',
  getClobHeaders: vi.fn().mockReturnValue({}),
  hasClobApiKey: vi.fn().mockReturnValue(false),
}));

import { getClobClient } from '../src/utils/clob_client';

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
  afterEach(() => {
    vi.resetAllMocks();
  });

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
    // maxSingleOrderCost check fires before SDK call — no getClobClient mock needed
    const walletConfig = {
      id: 'dash-live-w1',
      mode: 'LIVE' as const,
      strategy: 'momentum',
      capital: 500,
    };

    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, testLiveCfg, testFeeCfg);

    // Order cost = 0.5 * 100 = 50, exceeds maxSingleOrderCost=10 → rejected before any I/O
    const result = await wallet.placeOrder({
      marketId: 'MARKET-1',
      outcome: 'YES',
      side: 'BUY',
      price: 0.5,
      size: 100,
      tokenId: 'tok-1',
    });

    expect(result.status).toBe('rejected');
    expect(result.reason).toMatch(/maxSingleOrderCost/);
    // getClobClient should NOT have been called since we rejected before the SDK step
    expect(vi.mocked(getClobClient)).not.toHaveBeenCalled();
  });

  it('dashboard-created LIVE wallet with DEFAULT liveCfg allows large orders (bug scenario)', async () => {
    const mockClient = {
      createAndPostOrder: vi.fn().mockResolvedValue({ orderID: 'order-1' }),
    };
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    const walletConfig = {
      id: 'dash-live-w2',
      mode: 'LIVE' as const,
      strategy: 'momentum',
      capital: 5000,
    };

    const defaultWallet = new PolymarketWallet(walletConfig, 'momentum');

    // $50 order would be blocked by testLiveCfg (max=$10) but allowed by DEFAULT ($100)
    const resultDefault = await defaultWallet.placeOrder({
      marketId: 'MARKET-1', outcome: 'YES', side: 'BUY', price: 0.5, size: 100, tokenId: 'tok-1',
    });
    // DEFAULT allows up to $100, cost=50 → submitted
    expect(resultDefault.status).toBe('submitted');
  });
});
