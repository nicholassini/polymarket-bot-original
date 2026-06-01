import { MarketData } from '../types';
import { logger } from '../reporting/logs';

/** Raw shape returned by the Gamma API */
interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  outcomes: string;          // JSON string e.g. '["Yes","No"]'
  outcomePrices: string;     // JSON string e.g. '["0.55","0.45"]'
  clobTokenIds: string;      // JSON string of token-id strings
  bestBid: number;
  bestAsk: number;
  volume24hr: number;
  liquidityNum: number;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  /** ISO-8601 resolution / end date */
  endDate?: string;
  /** 1-day and 1-week price movements */
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  /** CTF condition ID (camelCase from Gamma response) */
  conditionId?: string;
  /** Nested events array – first entry carries event metadata */
  events?: Array<{
    id?: string;
    slug?: string;
    series?: Array<{ slug?: string }>;
  }>;
}

export class MarketFetcher {
  private readonly gammaApi: string;
  /** Max markets to return (0 = unlimited / fetch all pages) */
  private readonly limit: number;
  /** Page size for Gamma API pagination */
  private static readonly PAGE_SIZE = 100;

  constructor(gammaApi = 'https://gamma-api.polymarket.com', limit = 0) {
    this.gammaApi = gammaApi;
    this.limit = limit;
  }

  /**
   * Fetch active, open Polymarket markets sorted by volume.
   * Paginates through the Gamma API to collect all qualifying
   * markets (or up to `limit` if set).
   */
  async fetchSnapshot(): Promise<MarketData[]> {
    try {
      const raw = await this.fetchAllPages();
      const markets = this.parseMarkets(raw);
      logger.info({ count: markets.length, pages: Math.ceil(raw.length / MarketFetcher.PAGE_SIZE) }, 'Fetched live markets from Gamma API');
      return markets;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch markets from Gamma API');
      return [];
    }
  }

  /* ── Paginated fetcher ── */

  private async fetchAllPages(): Promise<GammaMarket[]> {
    const all: GammaMarket[] = [];
    let offset = 0;
    const pageSize = MarketFetcher.PAGE_SIZE;
    let consecutiveFailures = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const url = `${this.gammaApi}/markets?active=true&closed=false&limit=${pageSize}&offset=${offset}&order=volume24hr&ascending=false`;

      // Throttle pagination to avoid rate-limiting
      if (offset > 0) await new Promise((r) => setTimeout(r, 500));

      const page = await this.fetchPageWithRetry(url, offset);
      if (page === null) {
        consecutiveFailures++;
        // After 3 consecutive failures, stop pagination but return what we have
        if (consecutiveFailures >= 3) {
          logger.warn({ offset, collected: all.length }, 'Gamma API: 3 consecutive page failures, returning partial results');
          break;
        }
        // Skip this page and try the next offset
        offset += pageSize;
        continue;
      }

      consecutiveFailures = 0;
      if (page.length === 0) break;

      all.push(...page);

      // Stop early if we've hit the caller-requested limit
      if (this.limit > 0 && all.length >= this.limit) {
        return all.slice(0, this.limit);
      }

      // Last page was under-full → no more data
      if (page.length < pageSize) break;

      offset += pageSize;
    }

    return all;
  }

  /** Fetch a single page with up to 2 retries and exponential backoff. */
  private async fetchPageWithRetry(url: string, offset: number): Promise<GammaMarket[] | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        let response: Response;
        try {
          response = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }

        if (response.ok) {
          return await response.json() as GammaMarket[];
        }

        await response.text().catch(() => {}); // drain socket

        if (response.status === 429) {
          const retryAfter = Math.max(3, parseInt(response.headers.get('retry-after') || '5', 10));
          logger.warn({ status: 429, offset, attempt }, `Gamma API rate limited, waiting ${retryAfter}s`);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }
        if (response.status >= 500) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn({ status: response.status, offset, attempt }, `Gamma API server error, retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // 4xx (not 429) — don't retry
        logger.error({ status: response.status, offset }, 'Gamma API page request failed (client error)');
        return null;
      } catch (err) {
        if (attempt < 2) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn({ err, offset, attempt }, `Gamma API fetch error, retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          logger.error({ err, offset }, 'Gamma API page request failed after retries');
          return null;
        }
      }
    }
    return null;
  }

  /* ── Parse raw Gamma response into MarketData ── */

  private parseMarkets(raw: GammaMarket[]): MarketData[] {
    const markets: MarketData[] = [];

    for (const m of raw) {
      try {
        if (!m.acceptingOrders) continue;
        if (!m.clobTokenIds || m.clobTokenIds === '[]') continue;

        const outcomes: string[] = JSON.parse(m.outcomes || '[]');
        const outcomePrices: number[] = (JSON.parse(m.outcomePrices || '[]') as string[]).map(Number);
        const clobTokenIds: string[] = JSON.parse(m.clobTokenIds || '[]');

        if (outcomePrices.length === 0 || outcomePrices.every((p) => p === 0)) continue;

        const yesPrice = outcomePrices[0] ?? 0.5;
        const noPrice = outcomePrices[1] ?? 1 - yesPrice;
        let bid = m.bestBid ?? Math.max(0.01, yesPrice - 0.02);
        let ask = m.bestAsk ?? Math.min(0.99, yesPrice + 0.02);
        // Gamma sometimes returns bestBid > bestAsk; normalise
        if (bid > ask) {
          const tmp = bid;
          bid = ask;
          ask = tmp;
        }
        // Fallback: derive from yesPrice when bid/ask are zero or equal
        if (bid === 0 && ask === 0) {
          bid = Math.max(0.001, yesPrice - 0.01);
          ask = Math.min(0.999, yesPrice + 0.01);
        }
        const mid = (bid + ask) / 2;

        markets.push({
          marketId: m.id,
          question: m.question,
          slug: m.slug,
          outcomes,
          outcomePrices: [yesPrice, noPrice],
          clobTokenIds,
          midPrice: Number(mid.toFixed(4)),
          bid: Number(bid.toFixed(4)),
          ask: Number(ask.toFixed(4)),
          spread: Number((ask - bid).toFixed(4)),
          volume24h: m.volume24hr ?? 0,
          liquidity: m.liquidityNum ?? 0,
          timestamp: Date.now(),
          endDate: m.endDate ?? undefined,
          eventId: m.events?.[0]?.id ?? undefined,
          eventSlug: m.events?.[0]?.slug ?? undefined,
          seriesSlug: m.events?.[0]?.series?.[0]?.slug ?? undefined,
          oneDayPriceChange: m.oneDayPriceChange ?? undefined,
          oneWeekPriceChange: m.oneWeekPriceChange ?? undefined,
          conditionId: m.conditionId ?? undefined,
        });
      } catch {
        logger.warn({ marketId: m.id }, 'Skipping unparseable market');
      }
    }

    return markets;
  }
}
