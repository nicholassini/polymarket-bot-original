import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';
import { validateLiveCredentials } from '../src/core/config_validator';
import type { WalletConfig, LiveTradingConfig } from '../src/types';

const liveCfg: LiveTradingConfig = {
  maxSingleOrderCost: 10,
  maxPendingOrders: 3,
  maxDailyOrders: 20,
  orderTimeoutSeconds: 60,
  minBalanceReserve: 20,
};

const walletConfig: WalletConfig = {
  id: 'live-wallet',
  mode: 'LIVE',
  strategy: 'momentum',
  capital: 500,
  walletAddress: '0xAbCd1234AbCd1234AbCd1234AbCd1234AbCd1234',
};

describe('Reconciliation activation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('startReconciliation fires the reconcile callback at the given interval', () => {
    const reconcileSpy = vi.spyOn(PolymarketWallet.prototype as unknown as { reconcileBalance(): Promise<void> }, 'reconcileBalance').mockResolvedValue(undefined);

    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, liveCfg);
    wallet.startReconciliation(300_000);

    // Should not fire immediately
    expect(reconcileSpy).not.toHaveBeenCalled();

    // After one interval, should fire once
    vi.advanceTimersByTime(300_000);
    expect(reconcileSpy).toHaveBeenCalledTimes(1);

    // After another interval, should fire again
    vi.advanceTimersByTime(300_000);
    expect(reconcileSpy).toHaveBeenCalledTimes(2);

    wallet.stopReconciliation();
  });

  it('stopReconciliation halts the periodic calls', () => {
    const reconcileSpy = vi.spyOn(PolymarketWallet.prototype as unknown as { reconcileBalance(): Promise<void> }, 'reconcileBalance').mockResolvedValue(undefined);

    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, liveCfg);
    wallet.startReconciliation(300_000);
    vi.advanceTimersByTime(300_000);
    expect(reconcileSpy).toHaveBeenCalledTimes(1);

    wallet.stopReconciliation();
    vi.advanceTimersByTime(900_000); // 3 more intervals
    expect(reconcileSpy).toHaveBeenCalledTimes(1); // no new calls after stop
  });

  it('startReconciliation is idempotent — second call is a no-op', () => {
    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, liveCfg);
    wallet.startReconciliation(300_000);
    wallet.startReconciliation(300_000); // second call ignored
    wallet.stopReconciliation();
    // Should not throw
  });
});

describe('API key validation at startup', () => {
  beforeEach(() => {
    process.env.POLYMARKET_API_KEY = 'test-key';
  });
  afterEach(() => {
    delete process.env.POLYMARKET_API_KEY;
    vi.restoreAllMocks();
  });

  it('throws when CLOB API returns 401 (invalid key)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .rejects.toThrow(/CLOB API key validation failed.*401/);
  });

  it('throws when CLOB API returns 403 (forbidden key)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .rejects.toThrow(/CLOB API key validation failed.*403/);
  });

  it('throws on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .rejects.toThrow(/CLOB API connectivity check failed/);
  });

  it('resolves when CLOB API returns 200 (valid key)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .resolves.toBeUndefined();
  });

  it('resolves without calling fetch when API key is not set', async () => {
    delete process.env.POLYMARKET_API_KEY;
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
