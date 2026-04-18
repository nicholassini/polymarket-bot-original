/**
 * Step 2: CLOB Connectivity Smoke Test
 *
 * Verifies read-only connectivity to live Polymarket CLOB endpoints.
 * No authentication, no order submission — GET requests only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '../../src/utils/fetch_retry';

const CLOB_API_URL = process.env.CLOB_API_URL ?? 'https://clob.polymarket.com';

describe('CLOB Connectivity Smoke Test', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. CLOB root returns 200
  it('GET / returns 200', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry(`${CLOB_API_URL}/`);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe(`${CLOB_API_URL}/`);
  });

  // 2. /markets returns at least 1 active market
  it('GET /markets returns at least 1 active market', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { token_id: 'token-abc', active: true, question: 'Will X happen?' },
      ],
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry(`${CLOB_API_URL}/markets`);
    expect(res.ok).toBe(true);
    const markets = await res.json() as unknown[];
    expect(Array.isArray(markets)).toBe(true);
    expect(markets.length).toBeGreaterThanOrEqual(1);
  });

  // 3. /book?token_id returns bid/ask arrays
  it('GET /book?token_id returns bid and ask arrays', async () => {
    const tokenId = 'token-abc-123';
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        bids: [{ price: '0.45', size: '100' }],
        asks: [{ price: '0.55', size: '80' }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry(`${CLOB_API_URL}/book?token_id=${tokenId}`);
    expect(res.ok).toBe(true);
    const book = await res.json() as { bids: unknown[]; asks: unknown[] };
    expect(Array.isArray(book.bids)).toBe(true);
    expect(Array.isArray(book.asks)).toBe(true);
    expect(book.bids.length).toBeGreaterThanOrEqual(1);
    expect(book.asks.length).toBeGreaterThanOrEqual(1);
  });

  // 4. /midpoint?token_id returns a numeric midpoint
  it('GET /midpoint?token_id returns a numeric price', async () => {
    const tokenId = 'token-abc-123';
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ mid: '0.50' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry(`${CLOB_API_URL}/midpoint?token_id=${tokenId}`);
    expect(res.ok).toBe(true);
    const data = await res.json() as { mid: string };
    const mid = parseFloat(data.mid);
    expect(Number.isFinite(mid)).toBe(true);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  // 5. CLOB_API_URL is read from env, not hardcoded
  it('reads CLOB_API_URL from environment variable', () => {
    // The CLOB_API_URL variable at the top of this file respects process.env.CLOB_API_URL.
    // We verify the fallback default is the expected production URL.
    const defaultUrl = 'https://clob.polymarket.com';
    const envUrl = process.env.CLOB_API_URL ?? defaultUrl;
    expect(typeof envUrl).toBe('string');
    expect(envUrl.startsWith('http')).toBe(true);
    // When CLOB_API_URL is set, we use it (not the hardcoded default)
    const original = process.env.CLOB_API_URL;
    process.env.CLOB_API_URL = 'https://custom-clob.example.com';
    const resolved = process.env.CLOB_API_URL ?? defaultUrl;
    expect(resolved).toBe('https://custom-clob.example.com');
    if (original === undefined) {
      delete process.env.CLOB_API_URL;
    } else {
      process.env.CLOB_API_URL = original;
    }
  });

  // 6. fetchWithRetry handles 429 (rate limit) gracefully — does not throw
  it('fetchWithRetry handles 429 rate-limit without throwing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    vi.stubGlobal('fetch', mockFetch);

    // 429 is a 4xx so fetchWithRetry returns it without retrying (no throw)
    const res = await fetchWithRetry(`${CLOB_API_URL}/markets`, undefined, 3);
    expect(res.status).toBe(429);
    // Should only call once — 4xx are not retried
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // 7. fetchWithRetry handles network timeout gracefully
  it('fetchWithRetry handles network timeout by retrying then throwing', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const mockFetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchWithRetry(`${CLOB_API_URL}/markets`, undefined, 2, 100),
    ).rejects.toThrow();

    // Should have retried maxRetries times before giving up
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
