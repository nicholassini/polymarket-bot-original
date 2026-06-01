/**
 * One-time backfill script for positions with null condition_id.
 *
 * Maps marketId (which is a numeric Gamma market ID for the affected positions)
 * to a hex condition_id by:
 *   1. Looking up the market via Gamma API: GET /markets/{numericMarketId}
 *   2. Extracting conditionId from the response
 *   3. Verifying the conditionId on-chain (CTF.payoutDenominator returns without revert)
 *   4. Writing condition_id back to the positions table
 *
 * Run from project root:
 *   node backfill_conditionid.js
 *
 * Reads .env for POLYGON_RPC_URL. Does not require POLYMARKET_PRIVATE_KEY (read-only).
 *
 * Idempotent: skips positions that already have condition_id set.
 */

const Database = require('better-sqlite3');
const { ethers } = require('ethers');
require('dotenv').config();

const DB_PATH = '.runtime/trades.db';
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';
const RPC_URL = process.env.POLYGON_RPC_URL ?? 'https://polygon-bor-rpc.publicnode.com';
const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const CTF_ABI = ['function payoutDenominator(bytes32) view returns (uint256)'];

async function fetchGammaMarket(marketId) {
  const url = `${GAMMA_API}/markets/${marketId}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Gamma ${resp.status} for ${marketId}`);
  return resp.json();
}

async function fetchClobMarket(conditionId) {
  const url = `${CLOB_API}/markets/${conditionId}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`CLOB ${resp.status} for ${conditionId}`);
  return resp.json();
}

async function verifyConditionOnChain(conditionId) {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);
  // Just need it to not revert. Returns 0 for unsettled, >0 for settled. Either is valid.
  await ctf.payoutDenominator(conditionId);
}

async function main() {
  const db = new Database(DB_PATH);

  const rows = db.prepare(`
    SELECT id, wallet_id, market_id, outcome, token_id, condition_id
    FROM positions
    WHERE status = 'open' AND condition_id IS NULL
  `).all();

  console.log(`Found ${rows.length} open positions with null condition_id`);
  if (rows.length === 0) {
    console.log('Nothing to backfill. Exiting.');
    return;
  }

  for (const row of rows) {
    console.log(`\n--- Position ${row.id} (market ${row.market_id}, outcome ${row.outcome}) ---`);

    let conditionId;
    try {
      const market = await fetchGammaMarket(row.market_id);
      conditionId = market.conditionId;
      if (!conditionId || typeof conditionId !== 'string' || !conditionId.startsWith('0x')) {
        console.error(`  X Gamma did not return a valid conditionId. Got: ${JSON.stringify(market.conditionId)}`);
        continue;
      }
      console.log(`  Gamma -> conditionId: ${conditionId.slice(0, 16)}...`);
    } catch (err) {
      console.error(`  X Gamma fetch failed: ${err.message}`);
      continue;
    }

    // Cross-check via CLOB and verify the position's tokenId is in tokens[]
    try {
      const clob = await fetchClobMarket(conditionId);
      const found = clob.tokens.find((t) => t.token_id === row.token_id);
      if (!found) {
        console.error(`  X position tokenId ${row.token_id} not in CLOB tokens[] for ${conditionId.slice(0, 16)}... -- refusing to backfill`);
        console.error(`    CLOB tokens: ${clob.tokens.map((t) => `${t.outcome}=${t.token_id.slice(0, 12)}...`).join(', ')}`);
        continue;
      }
      console.log(`  CLOB OK: tokenId matches outcome "${found.outcome}"`);
    } catch (err) {
      console.error(`  X CLOB fetch failed: ${err.message}`);
      continue;
    }

    // Verify on-chain
    try {
      await verifyConditionOnChain(conditionId);
      console.log(`  Chain OK: payoutDenominator readable`);
    } catch (err) {
      console.error(`  X on-chain verification failed: ${err.message}`);
      continue;
    }

    // Write back
    const result = db.prepare(`
      UPDATE positions SET condition_id = ?, updated_at = ?
      WHERE id = ? AND condition_id IS NULL
    `).run(conditionId, new Date().toISOString(), row.id);

    if (result.changes === 1) {
      console.log(`  OK: backfilled position ${row.id}`);
    } else {
      console.log(`  WARN: no rows updated (already populated?)`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});