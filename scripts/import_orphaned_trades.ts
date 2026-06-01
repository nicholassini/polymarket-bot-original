import 'dotenv/config';
import { getClobClient } from '../src/utils/clob_client';
import { getTradesDB, closeTradesDB } from '../src/storage/trades_db';

const WALLET_ID = 'live_user_defined_1';
const INITIAL_BALANCE = 36;

async function main(): Promise<void> {
  console.log('Importing orphaned trades from Polymarket CLOB V2…');

  const client = await getClobClient();
  if (!client) {
    console.error('ClobClient unavailable — check POLYMARKET_PRIVATE_KEY');
    process.exit(1);
  }

  // Use ESM dynamic import pattern (same as clob_sdk.ts) in case the SDK
  // exposes helper types only accessible as a dynamic import
  const dynamicImport = new Function('specifier', 'return import(specifier)');
  const sdk = await dynamicImport('@polymarket/clob-client-v2') as typeof import('@polymarket/clob-client-v2');
  void sdk; // available if needed for type references

  let trades: Record<string, unknown>[] = [];
  try {
    // getTrades returns filled/matched orders for the authenticated wallet
    const raw = await (client as unknown as {
      getTrades(params: Record<string, unknown>): Promise<unknown>
    }).getTrades({ maker: process.env.POLYMARKET_WALLET_ADDRESS ?? '' });

    if (Array.isArray(raw)) {
      trades = raw as Record<string, unknown>[];
    } else if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).data)) {
      trades = (raw as { data: Record<string, unknown>[] }).data;
    }
  } catch (err) {
    console.error('Failed to fetch trades from CLOB:', err);
    process.exit(1);
  }

  console.log(`Fetched ${trades.length} trade(s) from CLOB`);

  const db = getTradesDB();
  let inserted = 0;
  let failed = 0;

  for (const trade of trades) {
    try {
      const price = Number(trade.price ?? 0);
      const size  = Number(trade.size  ?? 0);
      const cost  = price * size;
      const rawSide = String(trade.side ?? '').toUpperCase();
      const side: 'BUY' | 'SELL' = rawSide === 'BUY' || rawSide === '0' ? 'BUY' : 'SELL';

      db.recordTrade({
        orderId:   String(trade.id ?? trade.order_id ?? `orphan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
        walletId:  WALLET_ID,
        marketId:  String(trade.market ?? trade.market_id ?? ''),
        tokenId:   trade.asset_id   ? String(trade.asset_id)   : undefined,
        conditionId: trade.condition_id ? String(trade.condition_id) : undefined,
        side,
        outcome:   String(trade.outcome ?? ''),
        price,
        size,
        cost,
        fee:       Number(trade.fee ?? 0),
        txHash:    trade.transaction_hash ? String(trade.transaction_hash) : undefined,
        timestamp: trade.created_at ? String(trade.created_at) : new Date().toISOString(),
        status:    String(trade.status ?? 'matched'),
      });
      inserted++;
    } catch (err) {
      console.error(`  Failed to insert trade ${trade.id}:`, err);
      failed++;
    }
  }

  // Take an initial balance snapshot so the DB baseline is recorded
  db.snapshotBalance(WALLET_ID, INITIAL_BALANCE, 0, 0, 0);

  const stats   = db.getTradeStats(WALLET_ID);
  const summary = db.getPositionSummary(WALLET_ID);

  console.log(`\nImport complete`);
  console.log(`  Inserted : ${inserted} / ${trades.length} trades  (${failed} failed)`);
  console.log(`  Trade stats :`, stats);
  console.log(`  Position summary :`, summary);

  closeTradesDB();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
