/**
 * Centralized CLOB API client configuration.
 * All files that call the Polymarket CLOB API should use these helpers
 * instead of hardcoding URLs and headers.
 */

export const CLOB_API_URL = process.env.CLOB_API_URL ?? 'https://clob.polymarket.com';

/**
 * Returns auth headers for CLOB API requests.
 * If POLYMARKET_API_KEY is not set (paper trading mode), returns empty headers
 * and logs a debug message — does NOT throw.
 */
export function getClobHeaders(): Record<string, string> {
  const apiKey = process.env.POLYMARKET_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return {};
  }
  return { Authorization: `Bearer ${apiKey}` };
}

/**
 * Returns true if a CLOB API key is configured.
 * Useful for callers that want to skip CLOB fetches entirely in paper mode.
 */
export function hasClobApiKey(): boolean {
  const apiKey = process.env.POLYMARKET_API_KEY;
  return Boolean(apiKey && apiKey.trim() !== '');
}
