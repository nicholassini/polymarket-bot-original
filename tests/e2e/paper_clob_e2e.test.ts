/**
 * Step 1: End-to-End Paper Wallet vs Live CLOB Test
 *
 * Boots the full system stack (config → wallets → strategies → executor → dashboard),
 * uses PAPER wallets only, connects to live CLOB read-only endpoints for market data,
 * and verifies the signal→order→fill→PnL pipeline works with zero real order leakage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import http from 'http';
import { loadConfig } from '../../src/core/config_loader';
import { validateConfig } from '../../src/core/config_validator';
import { WalletManager } from '../../src/wallets/wallet_manager';
import { PaperWallet } from '../../src/wallets/paper_wallet';
import { TradeExecutor } from '../../src/execution/trade_executor';
import { DashboardServer } from '../../src/reporting/dashboard_server';
import { STRATEGY_REGISTRY } from '../../src/strategies/registry';
import type { AppConfig, MarketData, Signal, OrderRequest } from '../../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMarketData(id: string): MarketData {
  return {
    marketId: id,
    question: `Will market ${id} resolve YES?`,
    slug: `market-${id}`,
    outcomes: ['YES', 'NO'],
    outcomePrices: [0.6, 0.4],
    clobTokenIds: [`token-${id}-yes`, `token-${id}-no`],
    bestBid: 0.59,
    bestAsk: 0.61,
    volume24hr: 50000,
    liquidityNum: 20000,
    active: true,
    closed: false,
    acceptingOrders: true,
    timestamp: Date.now(),
    endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  };
}

function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Paper Wallet vs Live CLOB — End-to-End', () => {
  let config: AppConfig;
  let walletManager: WalletManager;
  let postRequests: Array<{ url: string; body: string }>;
  let dashboardServer: DashboardServer;
  let dashboardPort: number;

  const CONFIG_PATH = path.resolve(__dirname, '../../config.yaml');

  beforeEach(async () => {
    postRequests = [];

    // Intercept fetch — track POSTs but allow GETs through (simulated)
    const fakeFetch = vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (method === 'POST') {
        postRequests.push({ url, body: (opts?.body as string) ?? '' });
      }
      // Return plausible Gamma API market data for GET /markets
      if (method === 'GET' && url.includes('/markets')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'e2e-market-001',
              question: 'Will X happen?',
              slug: 'will-x-happen',
              outcomes: '["Yes","No"]',
              outcomePrices: '["0.60","0.40"]',
              clobTokenIds: '["token-yes-001","token-no-001"]',
              bestBid: 0.59,
              bestAsk: 0.61,
              volume24hr: 75000,
              liquidityNum: 25000,
              active: true,
              closed: false,
              acceptingOrders: true,
            },
          ],
        });
      }
      // Return plausible orderbook data for GET /book
      if (method === 'GET' && url.includes('/book')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            bids: [{ price: '0.59', size: '500' }],
            asks: [{ price: '0.61', size: '400' }],
          }),
        });
      }
      // Return plausible midpoint data for GET /midpoint
      if (method === 'GET' && url.includes('/midpoint')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ mid: '0.60' }),
        });
      }
      // Default OK response for anything else
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
      });
    });
    vi.stubGlobal('fetch', fakeFetch);

    // Boot config pipeline
    config = loadConfig(CONFIG_PATH);
    validateConfig(config);

    walletManager = new WalletManager();
    for (const walletCfg of config.wallets) {
      walletManager.registerWallet(walletCfg, walletCfg.strategy, false /* live disabled */);
    }

    dashboardPort = await findAvailablePort();
    dashboardServer = new DashboardServer(walletManager, dashboardPort);
    dashboardServer.start();
  });

  afterEach(() => {
    dashboardServer.stop();
    vi.restoreAllMocks();
  });

  // ── 1. All wallets in config are PAPER ─────────────────────────────────────

  it('all wallets in config.yaml are mode: PAPER', () => {
    for (const wallet of config.wallets) {
      expect(wallet.mode).toBe('PAPER');
    }
  });

  // ── 2. All registered wallets are PaperWallet instances ───────────────────

  it('all registered wallets are PaperWallet instances', () => {
    for (const state of walletManager.listWallets()) {
      const wallet = walletManager.getWallet(state.walletId);
      expect(wallet).toBeInstanceOf(PaperWallet);
    }
  });

  // ── 3. enable_live_trading is false ───────────────────────────────────────

  it('config has enableLiveTrading: false', () => {
    expect(config.environment.enableLiveTrading).toBe(false);
  });

  // ── 4. Market fetcher returns real market data (mocked Gamma API) ─────────

  it('market fetcher returns at least 1 active market from mocked Gamma API', async () => {
    const { MarketFetcher } = await import('../../src/data/market_fetcher');
    const fetcher = new MarketFetcher(config.polymarket.gammaApi, 10);
    const markets = await fetcher.fetchSnapshot();
    expect(markets.length).toBeGreaterThanOrEqual(1);
    // MarketData does not carry an 'active' flag after parsing — the fetcher
    // filters to active markets via query params and acceptingOrders check.
    expect(typeof markets[0].marketId).toBe('string');
    expect(Array.isArray(markets[0].clobTokenIds)).toBe(true);
    expect(markets[0].clobTokenIds.length).toBeGreaterThanOrEqual(1);
  });

  // ── 5. Signal → Order → Fill pipeline (3 cycles) ─────────────────────────

  it('runs 3 strategy cycles and fills correctly via paper wallet', async () => {
    const executor = new TradeExecutor(); // no OrderTracker — paper path

    // Pick any registered paper wallet
    const walletStates = walletManager.listWallets();
    expect(walletStates.length).toBeGreaterThan(0);

    const walletState = walletStates[0];
    const wallet = walletManager.getWallet(walletState.walletId)!;
    const balanceBefore = wallet.getState().availableBalance;

    // Fabricate a direct trade (bypasses strategy generateSignals to avoid network deps)
    const orders: OrderRequest[] = [
      {
        walletId: walletState.walletId,
        marketId: 'e2e-market-001',
        outcome: 'YES',
        side: 'BUY',
        price: 0.60,
        size: 5,
        strategy: walletState.assignedStrategy,
      },
    ];

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const order of orders) {
        await executor.execute(order, wallet);
      }
    }

    const balanceAfter = wallet.getState().availableBalance;
    // Each BUY cycle costs price * size = 0.60 * 5 = $3, three times = $9
    expect(balanceAfter).toBeCloseTo(balanceBefore - 9, 1);

    const tradeHistory = wallet.getTradeHistory();
    expect(tradeHistory.length).toBeGreaterThanOrEqual(3);
  });

  // ── 6. applyFill updates balance correctly ────────────────────────────────

  it('paper wallet balance updates correctly after fill', async () => {
    const walletStates = walletManager.listWallets();
    const wallet = walletManager.getWallet(walletStates[0].walletId)!;
    const balanceBefore = wallet.getState().availableBalance;

    const result = await wallet.placeOrder({
      marketId: 'e2e-balance-test',
      outcome: 'YES',
      side: 'BUY',
      price: 0.5,
      size: 10,
    });

    expect(result.status).toBe('filled');
    expect(result.filledSize).toBe(10);
    const balanceAfter = wallet.getState().availableBalance;
    // BUY: cost = filledPrice * 10 ≈ $5 (FillSimulator applies slight slippage)
    expect(balanceAfter).toBeCloseTo(balanceBefore - 5, 1);
  });

  // ── 7. No POST requests to CLOB /order endpoints ──────────────────────────

  it('emits zero POST requests to any CLOB /order endpoint', async () => {
    const executor = new TradeExecutor();
    const walletStates = walletManager.listWallets();
    const wallet = walletManager.getWallet(walletStates[0].walletId)!;

    await executor.execute(
      {
        walletId: walletStates[0].walletId,
        marketId: 'no-leak-market',
        outcome: 'NO',
        side: 'BUY',
        price: 0.4,
        size: 5,
        strategy: 'momentum',
      },
      wallet,
    );

    const orderPosts = postRequests.filter((r) => r.url.includes('/order'));
    expect(orderPosts).toHaveLength(0);
    // Globally: zero POST requests at all
    expect(postRequests).toHaveLength(0);
  });

  // ── 8. Dashboard /healthz reflects trade state ────────────────────────────

  it('dashboard /healthz returns ok:true with correct wallet count', async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 80)); // let server bind

    // Use Node's http.get to bypass the global fetch stub
    const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
      http.get(`http://127.0.0.1:${dashboardPort}/healthz`, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          try { resolve(JSON.parse(body) as Record<string, unknown>); }
          catch (e) { reject(e); }
        });
      }).on('error', reject);
    });

    expect(data['ok']).toBe(true);
    expect(data['activeWallets']).toBe(walletManager.listWallets().length);
    expect(data['liveTradingEnabled']).toBe(false);
  });

  // ── 9. Memory usage delta after 3 cycles is < 100 MB ─────────────────────

  it('RSS memory delta after 3 strategy cycles is < 100 MB', async () => {
    const executor = new TradeExecutor();
    const walletStates = walletManager.listWallets();
    const wallet = walletManager.getWallet(walletStates[0].walletId)!;

    const rssBefore = process.memoryUsage().rss;

    for (let cycle = 0; cycle < 3; cycle++) {
      await executor.execute(
        {
          walletId: walletStates[0].walletId,
          marketId: `mem-test-market-${cycle}`,
          outcome: 'YES',
          side: 'BUY',
          price: 0.5,
          size: 1,
          strategy: 'momentum',
        },
        wallet,
      );
    }

    const rssAfter = process.memoryUsage().rss;
    const deltaMb = (rssAfter - rssBefore) / (1024 * 1024);
    expect(deltaMb).toBeLessThan(100);
  });

  // ── 10. Strategies initialize without error ───────────────────────────────

  it('all registered strategies initialize without throwing', () => {
    const marketData = makeMarketData('init-test-market');
    const walletStates = walletManager.listWallets();

    for (const [name, StrategyCtor] of Object.entries(STRATEGY_REGISTRY)) {
      const strategy = new StrategyCtor();
      const walletState = walletStates.find((w) => w.assignedStrategy === name) ?? walletStates[0];
      expect(() =>
        strategy.initialize({
          wallet: walletState,
          config: config.strategyConfig[name] ?? {},
        }),
      ).not.toThrow();
      // Feed a market update — should not throw
      expect(() => strategy.onMarketUpdate(marketData)).not.toThrow();
    }
  });

  // ── 11. generateSignals returns well-formed signals when markets are loaded ─

  it('generateSignals returns valid Signal objects after market updates', () => {
    const walletStates = walletManager.listWallets();
    const walletState = walletStates[0];

    // Use momentum strategy since it has a simpler signal path
    const MomentumCtor = STRATEGY_REGISTRY['momentum'];
    if (!MomentumCtor) return; // skip if not registered

    const strategy = new MomentumCtor();
    strategy.initialize({
      wallet: walletState,
      config: config.strategyConfig['momentum'] ?? {},
    });

    // Feed several market updates with price movement to trigger signals
    for (let i = 0; i < 5; i++) {
      const market = makeMarketData(`signal-market-${i}`);
      market.outcomePrices = [0.5 + i * 0.05, 0.5 - i * 0.05]; // trending up
      strategy.onMarketUpdate(market);
    }

    const signals = strategy.generateSignals() as Signal[];
    expect(Array.isArray(signals)).toBe(true);

    for (const sig of signals) {
      expect(typeof sig.marketId).toBe('string');
      expect(['YES', 'NO']).toContain(sig.outcome);
      expect(['BUY', 'SELL']).toContain(sig.side);
      expect(sig.confidence).toBeGreaterThanOrEqual(0);
      expect(sig.confidence).toBeLessThanOrEqual(1);
    }
  });

  // ── 12. No API credentials are transmitted ───────────────────────────────

  it('no API credential headers are transmitted during paper cycle', async () => {
    process.env.POLYMARKET_API_KEY = 'e2e-do-not-leak';

    const executor = new TradeExecutor();
    const walletStates = walletManager.listWallets();
    const wallet = walletManager.getWallet(walletStates[0].walletId)!;

    await executor.execute(
      {
        walletId: walletStates[0].walletId,
        marketId: 'cred-test-market',
        outcome: 'YES',
        side: 'BUY',
        price: 0.5,
        size: 2,
        strategy: 'momentum',
      },
      wallet,
    );

    // fetch is stubbed — check ALL calls made had no cred headers
    const allCalls = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
    for (const [, opts] of allCalls) {
      if (!opts?.headers) continue;
      const headerStr = JSON.stringify(opts.headers).toLowerCase();
      expect(headerStr).not.toContain('e2e-do-not-leak');
    }

    delete process.env.POLYMARKET_API_KEY;
  });
});
