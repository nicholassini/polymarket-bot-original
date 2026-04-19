/**
 * Centralized CLOB API client configuration.
 * All files that call the Polymarket CLOB API should use these helpers
 * instead of hardcoding URLs and headers.
 */

import { ClobClient, Chain } from '@polymarket/clob-client-v2';
import { Wallet } from 'ethers';
import { logger } from '../reporting/logs';

export const CLOB_API_URL = process.env.CLOB_API_URL ?? 'https://clob.polymarket.com';

// Singleton — initialized once at startup
let _clobClient: ClobClient | null = null;
let _initPromise: Promise<ClobClient | null> | null = null;

/**
 * Returns an authenticated V2 ClobClient singleton.
 * Returns null when POLYMARKET_PRIVATE_KEY is not set (paper-only mode).
 */
export async function getClobClient(): Promise<ClobClient | null> {
  if (_clobClient) return _clobClient;
  if (_initPromise) return _initPromise;

  _initPromise = _init();
  return _initPromise;
}

async function _init(): Promise<ClobClient | null> {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  if (!privateKey || privateKey.trim() === '') {
    logger.debug('POLYMARKET_PRIVATE_KEY not set — ClobClient unavailable (paper mode)');
    return null;
  }

  try {
    const wallet = new Wallet(privateKey);
    const host = process.env.POLYMARKET_CLOB_API ?? CLOB_API_URL;

    // ethers Wallet satisfies the EthersSigner interface the SDK expects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signer = wallet as any;

    // Step 1: derive API credentials using an unauthenticated client
    const tempClient = new ClobClient({ host, chain: Chain.POLYGON, signer });
    const creds = await tempClient.createOrDeriveApiKey();

    // Step 2: build the fully authenticated client
    const client = new ClobClient({
      host,
      chain: Chain.POLYGON,
      signer,
      creds,
      funderAddress: wallet.address,
    });

    _clobClient = client;
    logger.info({ address: wallet.address }, 'ClobClient initialized with V2 credentials');
    return client;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Failed to initialize ClobClient');
    _initPromise = null; // allow retry
    return null;
  }
}

/** Reset the singleton — used in tests */
export function _resetClobClient(): void {
  _clobClient = null;
  _initPromise = null;
}

/**
 * Returns auth headers for CLOB API requests.
 * If POLYMARKET_API_KEY is not set (paper trading mode), returns empty headers.
 * @deprecated V2 uses SDK for writes; raw-fetch callers that still need headers use this.
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
 */
export function hasClobApiKey(): boolean {
  const apiKey = process.env.POLYMARKET_API_KEY;
  return Boolean(apiKey && apiKey.trim() !== '');
}
