import { EventEmitter } from 'events';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { MarketData } from '../types';
import { MarketFetcher } from './market_fetcher';
import { logger } from '../reporting/logs';
import { consoleLog } from '../reporting/console_log';

/**
 * Polls the Polymarket Gamma API at a configurable interval and emits
 * real MarketData updates for every tracked market.
 */
export class OrderbookStream extends EventEmitter {
  private static readonly MAX_CACHE_SIZE = 2_000;
  private static readonly MAX_SEEN_MARKETS = 2_000;
  private timer?: NodeJS.Timeout;
  private readonly fetcher: MarketFetcher;
  private readonly pollMs: number;
  /** Cache of latest data keyed by marketId so strategies see history */
  private readonly cache = new Map<string, MarketData>();
  /** Persistent cache of markets seen across restarts */
  private readonly seenMarkets = new Map<string, { firstSeenAt: string; lastSeenAt: string }>();
  private readonly seenCachePath: string;
  private pollCount = 0;
  private lastPersistAt = 0;
  private persistPending = false;

  constructor(
    gammaApi?: string,
    pollMs = 15_000,
    seenCachePath = path.join(process.cwd(), '.cache', 'market_seen.json'),
  ) {
    super();
    this.fetcher = new MarketFetcher(gammaApi);
    this.pollMs = pollMs;
    this.seenCachePath = seenCachePath;
    this.loadSeenCache();
  }

  /** Start polling. First poll fires immediately. */
  start(): void {
    if (this.timer) return;
    // Fire immediately, then at interval
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.pollMs);
    logger.info({ pollMs: this.pollMs }, 'OrderbookStream started (live Gamma polling)');
    consoleLog.success('SCAN', `OrderbookStream started — polling Gamma every ${this.pollMs / 1000}s`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      logger.info('OrderbookStream stopped');
      consoleLog.warn('SCAN', 'OrderbookStream stopped');
    }
    this.cache.clear();
    this.removeAllListeners();
  }

  getMarket(marketId: string): MarketData | undefined {
    return this.cache.get(marketId);
  }

  getAllMarkets(): MarketData[] {
    return [...this.cache.values()];
  }

  /** Return a snapshot of persistent seen markets (for dashboards/diagnostics). */
  getSeenMarkets(): Array<{ marketId: string; firstSeenAt: string; lastSeenAt: string }> {
    return [...this.seenMarkets.entries()].map(([marketId, entry]) => ({
      marketId,
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
    }));
  }

  private async poll(): Promise<void> {
    try {
      const markets = await this.fetcher.fetchSnapshot();
      const newlyDiscovered = this.updateSeenCache(markets);
      const prevSize = this.cache.size;
      for (const m of markets) {
        this.cache.set(m.marketId, m);
        this.emit('update', m);
      }
      this.evictStaleEntries();
      this.persistSeenCache();
      this.pollCount++;
      const newMarkets = this.cache.size - prevSize;
      consoleLog.debug(
        'SCAN',
        `Poll #${this.pollCount} complete — ${markets.length} markets fetched, ${this.cache.size} cached${newMarkets > 0 ? `, ${newMarkets} new cached` : ''}${newlyDiscovered > 0 ? `, ${newlyDiscovered} newly discovered` : ''}`,
        {
        pollNumber: this.pollCount,
        fetched: markets.length,
        cached: this.cache.size,
        newMarkets,
        newlyDiscovered,
      },
      );
    } catch (error) {
      logger.error({ error }, 'OrderbookStream poll failed');
      const msg = error instanceof Error ? error.message : String(error);
      consoleLog.error('SCAN', `Poll failed: ${msg}`, { error: msg });
    }
  }

  private loadSeenCache(): void {
    try {
      if (!fs.existsSync(this.seenCachePath)) return;
      const raw = fs.readFileSync(this.seenCachePath, 'utf8');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, { firstSeenAt: string; lastSeenAt: string }>;
      for (const [marketId, entry] of Object.entries(parsed)) {
        if (!entry?.firstSeenAt || !entry?.lastSeenAt) continue;
        this.seenMarkets.set(marketId, {
          firstSeenAt: entry.firstSeenAt,
          lastSeenAt: entry.lastSeenAt,
        });
      }
      if (this.seenMarkets.size > 0) {
        logger.info({ count: this.seenMarkets.size }, 'OrderbookStream loaded persistent market cache');
      }
    } catch (error) {
      logger.warn({ error }, 'OrderbookStream failed to load persistent market cache');
    }
  }

  private persistSeenCache(): void {
    // Debounce: write at most once every 5 minutes, async to avoid blocking
    const now = Date.now();
    if (now - this.lastPersistAt < 300_000 || this.persistPending) return;
    this.persistPending = true;
    this.lastPersistAt = now;

    const payload: Record<string, { firstSeenAt: string; lastSeenAt: string }> = {};
    for (const [marketId, entry] of this.seenMarkets.entries()) {
      payload[marketId] = { firstSeenAt: entry.firstSeenAt, lastSeenAt: entry.lastSeenAt };
    }
    const data = JSON.stringify(payload);

    const dir = path.dirname(this.seenCachePath);
    const doWrite = async () => {
      try {
        await fsp.mkdir(dir, { recursive: true });
        await fsp.writeFile(this.seenCachePath, data);
      } catch (error) {
        logger.warn({ error }, 'OrderbookStream failed to persist market cache');
      } finally {
        this.persistPending = false;
      }
    };
    void doWrite();
  }

  private updateSeenCache(markets: MarketData[]): number {
    if (markets.length === 0) return 0;
    const now = new Date().toISOString();
    let newlyDiscovered = 0;

    for (const market of markets) {
      const existing = this.seenMarkets.get(market.marketId);
      if (!existing) {
        newlyDiscovered++;
        this.seenMarkets.set(market.marketId, { firstSeenAt: now, lastSeenAt: now });
      } else {
        existing.lastSeenAt = now;
      }
    }

    return newlyDiscovered;
  }

  /** Evict oldest entries from cache and seenMarkets when they exceed limits */
  private evictStaleEntries(): void {
    if (this.cache.size > OrderbookStream.MAX_CACHE_SIZE) {
      const excess = this.cache.size - OrderbookStream.MAX_CACHE_SIZE;
      const iter = this.cache.keys();
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value;
        if (key !== undefined) this.cache.delete(key);
      }
    }
    if (this.seenMarkets.size > OrderbookStream.MAX_SEEN_MARKETS) {
      // FIFO eviction: Map iterates in insertion order, delete oldest
      const excess = this.seenMarkets.size - OrderbookStream.MAX_SEEN_MARKETS;
      const iter = this.seenMarkets.keys();
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value;
        if (key !== undefined) this.seenMarkets.delete(key);
      }
    }
  }
}
