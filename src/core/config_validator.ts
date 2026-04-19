import { AppConfig } from '../types';
import { listStrategies } from '../strategies/registry';
import { logger } from '../reporting/logs';

/**
 * Ping the CLOB API with the configured API key to verify credentials at startup.
 * Throws if the key is explicitly rejected (401/403) or the server is unreachable.
 * Only call this when live trading is enabled.
 */
export async function validateLiveCredentials(clobApi: string): Promise<void> {
  const apiKey = process.env.POLYMARKET_API_KEY;
  if (!apiKey) return; // already caught by validateConfig

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(`${clobApi}/`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`CLOB API key validation failed: HTTP ${resp.status} — check POLYMARKET_API_KEY`);
    }
    logger.info({ status: resp.status }, 'CLOB API credentials validated at startup');
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('CLOB API key')) throw err;
    throw new Error(`CLOB API connectivity check failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

export function validateConfig(config: AppConfig): void {
  const errors: string[] = [];

  // Live trading requires an API key
  if (config.environment.enableLiveTrading) {
    if (!process.env.POLYMARKET_API_KEY || process.env.POLYMARKET_API_KEY.trim() === '') {
      errors.push('enableLiveTrading is true but POLYMARKET_API_KEY is not set');
    }
  }

  // All wallet configs must have capital > 0
  for (const wallet of config.wallets) {
    if (wallet.capital <= 0) {
      errors.push(`Wallet "${wallet.id}" has capital <= 0 (got ${wallet.capital})`);
    }
  }

  // Strategy names must be registered
  const knownStrategies = listStrategies();
  for (const wallet of config.wallets) {
    if (!knownStrategies.includes(wallet.strategy)) {
      errors.push(`Wallet "${wallet.id}" references unknown strategy "${wallet.strategy}". Known: ${knownStrategies.join(', ')}`);
    }
  }

  // maxMarkets must be a positive integer <= 10000 (if set)
  if (config.polymarket.maxMarkets !== undefined) {
    const mm = config.polymarket.maxMarkets;
    if (!Number.isInteger(mm) || mm <= 0 || mm > 10000) {
      errors.push(`polymarket.maxMarkets must be a positive integer between 1 and 10000 (got ${mm})`);
    }
  }

  // Live trading safety limits
  const lt = config.liveTrading;
  if (lt.maxSingleOrderCost <= 0 || lt.maxSingleOrderCost > 1000) {
    errors.push(`live_trading.max_single_order_cost must be > 0 and <= 1000 (got ${lt.maxSingleOrderCost})`);
  }
  if (!Number.isInteger(lt.maxPendingOrders) || lt.maxPendingOrders < 1 || lt.maxPendingOrders > 20) {
    errors.push(`live_trading.max_pending_orders must be an integer >= 1 and <= 20 (got ${lt.maxPendingOrders})`);
  }
  if (!Number.isInteger(lt.maxDailyOrders) || lt.maxDailyOrders < 1 || lt.maxDailyOrders > 1000) {
    errors.push(`live_trading.max_daily_orders must be an integer >= 1 and <= 1000 (got ${lt.maxDailyOrders})`);
  }
  if (lt.orderTimeoutSeconds < 30 || lt.orderTimeoutSeconds > 600) {
    errors.push(`live_trading.order_timeout_seconds must be >= 30 and <= 600 (got ${lt.orderTimeoutSeconds})`);
  }
  if (lt.minBalanceReserve < 0) {
    errors.push(`live_trading.min_balance_reserve must be >= 0 (got ${lt.minBalanceReserve})`);
  }

  // Fee rates must be between 0 and 1 (inclusive)
  const fees = config.fees;
  if (fees.takerFeeRate < 0 || fees.takerFeeRate > 1) {
    errors.push(`fees.taker_fee_rate must be between 0 and 1 (got ${fees.takerFeeRate})`);
  }
  if (fees.makerFeeRate < 0 || fees.makerFeeRate > 1) {
    errors.push(`fees.maker_fee_rate must be between 0 and 1 (got ${fees.makerFeeRate})`);
  }

  // DASHBOARD_PORT must be a valid integer 1024-65535 (if set)
  const portEnv = process.env.DASHBOARD_PORT;
  if (portEnv !== undefined && portEnv !== '') {
    const port = Number(portEnv);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      errors.push(`DASHBOARD_PORT must be an integer between 1024 and 65535 (got "${portEnv}")`);
    }
  }

  for (const err of errors) {
    logger.error({ validationError: err }, 'Config validation failed');
  }

  if (errors.length > 0) {
    throw new Error(`Config validation failed with ${errors.length} error(s). See logs above.`);
  }
}
