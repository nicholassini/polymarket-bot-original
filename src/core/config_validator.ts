import { AppConfig } from '../types';
import { listStrategies } from '../strategies/registry';
import { logger } from '../reporting/logs';
import { getClobClient } from '../utils/clob_client';

/**
 * Validate live credentials at startup by initializing the V2 ClobClient.
 * The client calls createOrDeriveApiKey() internally, which confirms the
 * private key is valid and the CLOB is reachable.
 */
export async function validateLiveCredentials(_clobApi: string): Promise<void> {
  const client = await getClobClient();
  if (!client) {
    throw new Error('CLOB V2 credential check failed: getClobClient() returned null — is POLYMARKET_PRIVATE_KEY set?');
  }
  try {
    await client.getServerTime();
    logger.info('CLOB V2 credentials validated at startup');
  } catch (err) {
    throw new Error(`CLOB V2 connectivity check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function validateConfig(config: AppConfig): void {
  const errors: string[] = [];

  // Live trading requires a private key for V2 SDK auth
  if (config.environment.enableLiveTrading) {
    const pk = process.env.POLYMARKET_PRIVATE_KEY;
    if (!pk || pk.trim() === '') {
      errors.push('enableLiveTrading is true but POLYMARKET_PRIVATE_KEY is not set');
    } else if (!pk.trim().startsWith('0x')) {
      errors.push('POLYMARKET_PRIVATE_KEY must start with 0x');
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
