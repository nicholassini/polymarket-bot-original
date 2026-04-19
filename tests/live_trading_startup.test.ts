import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';
import { validateLiveCredentials } from '../src/core/config_validator';
import type { WalletConfig, LiveTradingConfig } from '../src/types';

// Mock getClobClient so validateLiveCredentials can be tested without a real private key
vi.mock('../src/utils/clob_client', () => ({
  getClobClient: vi.fn(),
  _resetClobClient: vi.fn(),
  CLOB_API_URL: 'https://clob.polymarket.com',
  getClobHeaders: vi.fn().mockReturnValue({}),
  hasClobApiKey: vi.fn().mockReturnValue(false),
}));

import { getClobClient } from '../src/utils/clob_client';

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

    expect(reconcileSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300_000);
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
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
    vi.advanceTimersByTime(900_000);
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
  });

  it('startReconciliation is idempotent — second call is a no-op', () => {
    const wallet = new PolymarketWallet(walletConfig, 'momentum', undefined, liveCfg);
    wallet.startReconciliation(300_000);
    wallet.startReconciliation(300_000);
    wallet.stopReconciliation();
  });
});

describe('V2 credential validation at startup', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('throws when getClobClient returns null (no private key configured)', async () => {
    vi.mocked(getClobClient).mockResolvedValue(null as never);

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .rejects.toThrow(/getClobClient.*returned null/);
  });

  it('throws on getServerTime failure (CLOB unreachable)', async () => {
    const mockClient = {
      getServerTime: vi.fn().mockRejectedValue(new Error('connection refused')),
    };
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .rejects.toThrow(/CLOB V2 connectivity check failed/);
  });

  it('resolves when getClobClient succeeds and getServerTime works', async () => {
    const mockClient = {
      getServerTime: vi.fn().mockResolvedValue(Date.now()),
    };
    vi.mocked(getClobClient).mockResolvedValue(mockClient as never);

    await expect(validateLiveCredentials('https://clob.polymarket.com'))
      .resolves.toBeUndefined();
  });
});
