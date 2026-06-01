#!/usr/bin/env node
/**
 * backfill_condition_id.js
 *
 * Backfills condition_id for all open positions with NULL condition_id.
 * Reads, verifies (CLOB/Gamma API + on-chain payoutDenominator), then writes.
 *
 * Halt conditions (per spec):
 *   - API returns unexpected schema
 *   - payoutDenominator call reverts
 *   - Any UPDATE affects 0 or >1 rows
 *
 * Usage:  node backfill_condition_id.js
 */

require("dotenv").config();
const Database = require("better-sqlite3");
const { ethers } = require("ethers");
const https = require("https");

const DB_PATH = ".runtime/trades.db";
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const CTF_ABI = ["function payoutDenominator(bytes32) view returns (uint256)"];
const RPC_URL = process.env.POLYGON_RPC_URL || process.env.POLYGON_ARCHIVE_RPC_URL;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "Accept": "application/json" } }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            reject(new Error(`JSON parse error from ${url}: ${e.message}\nBody: ${body.slice(0, 200)}`));
          }
        });
      })
      .on("error", reject);
  });
}

function isHexMarketId(market_id) {
  return typeof market_id === "string" && /^0x[0-9a-f]{64}$/i.test(market_id);
}

function pad32(hex) {
  // Ensure the condition_id is a properly padded 32-byte hex for ethers
  return hex.startsWith("0x") ? hex : "0x" + hex;
}

// ── Step 1: Read ──────────────────────────────────────────────────────────────

async function main() {
  if (!RPC_URL) {
    console.error("[FAIL] No RPC URL set. Set POLYGON_RPC_URL in .env");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);

  const db = new Database(DB_PATH, { readonly: true });
  const openNulls = db
    .prepare("SELECT id, market_id, condition_id FROM positions WHERE status='open' AND condition_id IS NULL")
    .all();
  const allOpen = db
    .prepare("SELECT id, market_id, condition_id FROM positions WHERE status='open'")
    .all();
  db.close();

  console.log(`\n[PRE-STATE]`);
  console.log(`  Open positions total         : ${allOpen.length}`);
  console.log(`  Open positions NULL cond_id  : ${openNulls.length}`);
  console.log(`  Rows to backfill: ${openNulls.map((r) => `(id=${r.id}, market_id=${r.market_id})`).join(", ")}\n`);

  if (openNulls.length === 0) {
    console.log("[OK] Nothing to backfill.");
    generateReport([], allOpen.length);
    return;
  }

  // ── Step 2: Derive condition_ids ─────────────────────────────────────────

  const derivations = [];

  for (const row of openNulls) {
    const { id, market_id } = row;
    let derived_condition_id = null;
    let derivation_method = null;
    let api_verified = false;
    let api_source = null;

    if (isHexMarketId(market_id)) {
      // Spec: if hex 66-char, condition_id == market_id.
      // Verify via CLOB API.
      derivation_method = "hex_equals_market_id";
      const url = `https://clob.polymarket.com/markets/${market_id}`;
      console.log(`[id=${id}] Querying CLOB API: ${url}`);
      const { status, data } = await fetchJson(url);

      if (status !== 200) {
        console.error(`[FAIL] CLOB API returned HTTP ${status} for market_id=${market_id}`);
        process.exit(1);
      }
      if (!data.condition_id) {
        console.error(`[HALT] CLOB API response missing condition_id field. Got: ${JSON.stringify(data).slice(0, 300)}`);
        process.exit(1);
      }

      api_source = `CLOB GET /markets/${market_id} → condition_id=${data.condition_id}`;
      const clob_condition_id = data.condition_id.toLowerCase();
      const market_lower = market_id.toLowerCase();

      if (clob_condition_id !== market_lower) {
        console.warn(`[WARN] id=${id}: CLOB condition_id (${clob_condition_id}) != market_id (${market_lower})`);
        console.warn(`       Using CLOB-returned condition_id.`);
      }
      derived_condition_id = data.condition_id;
      api_verified = true;
      console.log(`[id=${id}] Derived: ${derived_condition_id} (CLOB verified: ${api_verified})`);
    } else {
      // Numeric market_id: query Gamma API (path param endpoint, not query string)
      derivation_method = "gamma_api_conditionId";
      const url = `https://gamma-api.polymarket.com/markets/${market_id}`;
      console.log(`[id=${id}] Querying Gamma API: ${url}`);
      const { status, data } = await fetchJson(url);

      if (status !== 200) {
        console.error(`[FAIL] Gamma API returned HTTP ${status} for market_id=${market_id}`);
        process.exit(1);
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        console.error(`[HALT] Gamma API returned unexpected shape for market_id=${market_id}: ${JSON.stringify(data).slice(0, 200)}`);
        process.exit(1);
      }
      if (!data.conditionId) {
        console.error(`[HALT] Gamma API response missing conditionId field. Got: ${JSON.stringify(data).slice(0, 300)}`);
        process.exit(1);
      }

      api_source = `Gamma GET /markets/${market_id} → conditionId=${data.conditionId}`;
      derived_condition_id = data.conditionId;
      api_verified = true;
      console.log(`[id=${id}] Derived: ${derived_condition_id} (Gamma verified: ${api_verified})`);
    }

    derivations.push({ id, market_id, derivation_method, derived_condition_id, api_verified, api_source });
  }

  // ── Step 3: On-chain verification ─────────────────────────────────────────

  console.log(`\n[ON-CHAIN VERIFY] Calling CTF.payoutDenominator for each derived condition_id...`);

  for (const d of derivations) {
    let onchain_valid = false;
    let denom = null;
    try {
      denom = await ctf.payoutDenominator(pad32(d.derived_condition_id));
      onchain_valid = true;
      console.log(`[id=${d.id}] payoutDenominator(${d.derived_condition_id}) = ${denom.toString()} ✓`);
    } catch (err) {
      console.error(`[HALT] id=${d.id}: payoutDenominator reverted for ${d.derived_condition_id}: ${err.message}`);
      console.error(`       NOT writing any changes.`);
      process.exit(1);
    }
    d.onchain_valid = onchain_valid;
    d.onchain_denom = denom.toString();
  }

  console.log(`\n[ALL ON-CHAIN CHECKS PASSED] Proceeding to write...`);

  // ── Step 4: Write ─────────────────────────────────────────────────────────

  const dbWrite = new Database(DB_PATH);
  const now = new Date().toISOString();

  const writes = [];
  dbWrite.transaction(() => {
    for (const d of derivations) {
      const before = dbWrite
        .prepare("SELECT id, market_id, condition_id FROM positions WHERE id = ?")
        .get(d.id);

      const result = dbWrite
        .prepare(
          "UPDATE positions SET condition_id = ?, updated_at = ? WHERE id = ? AND status = 'open' AND condition_id IS NULL"
        )
        .run(d.derived_condition_id, now, d.id);

      if (result.changes !== 1) {
        console.error(`[HALT] id=${d.id}: UPDATE affected ${result.changes} rows (expected 1). Rolling back.`);
        dbWrite.close();
        process.exit(1);
      }

      const after = dbWrite
        .prepare("SELECT id, market_id, condition_id FROM positions WHERE id = ?")
        .get(d.id);

      writes.push({ id: d.id, before, after, rows_changed: result.changes });
      console.log(`[WRITE] id=${d.id}: condition_id NULL → ${d.derived_condition_id} (rows_changed=${result.changes})`);
    }
  })();
  dbWrite.close();

  // ── Step 5: Post-verify ───────────────────────────────────────────────────

  const dbCheck = new Database(DB_PATH, { readonly: true });
  const postNulls = dbCheck
    .prepare("SELECT id FROM positions WHERE status='open' AND condition_id IS NULL")
    .all();
  const postAll = dbCheck
    .prepare("SELECT id, market_id, condition_id FROM positions WHERE status='open'")
    .all();
  dbCheck.close();

  console.log(`\n[POST-STATE]`);
  console.log(`  Open positions with NULL condition_id: ${postNulls.length} (expected 0)`);
  console.log(`  Total open positions: ${postAll.length}`);

  if (postNulls.length !== 0) {
    console.error(`[FAIL] Post-verify failed: ${postNulls.length} NULLs remain.`);
    process.exit(1);
  }
  console.log(`[OK] All condition_ids backfilled successfully.`);

  // ── Generate markdown report ──────────────────────────────────────────────
  generateReport(derivations, writes, openNulls.length, postAll.length, now);
}

function generateReport(derivations, writes, preNullCount, postTotal, timestamp) {
  const lines = [];
  lines.push(`# condition_id Backfill`);
  lines.push(``);
  lines.push(`**Run timestamp:** ${timestamp || new Date().toISOString()}`);
  lines.push(``);
  lines.push(`## Pre-State`);
  lines.push(``);
  lines.push(`Open positions with NULL condition_id: **${preNullCount}**`);
  lines.push(``);
  if (derivations.length > 0) {
    const listItems = derivations.map((d) => `- (id=${d.id}, market_id=${d.market_id})`).join("\n");
    lines.push(`List:\n${listItems}`);
  }
  lines.push(``);
  lines.push(`## Derivation`);
  lines.push(``);
  lines.push(`| id | market_id | derivation_method | derived_condition_id | clob_or_gamma_verified | onchain_valid | onchain_payoutDenominator | source |`);
  lines.push(`|----|-----------|-------------------|----------------------|------------------------|---------------|---------------------------|--------|`);
  for (const d of derivations) {
    const mid = d.market_id.length > 20 ? d.market_id.slice(0, 10) + "…" + d.market_id.slice(-6) : d.market_id;
    const cid = d.derived_condition_id.slice(0, 10) + "…" + d.derived_condition_id.slice(-6);
    lines.push(
      `| ${d.id} | \`${mid}\` | ${d.derivation_method} | \`${cid}\` | ${d.api_verified ? "✓" : "✗"} | ${d.onchain_valid ? "✓" : "✗"} | ${d.onchain_denom} | ${d.api_source} |`
    );
  }
  lines.push(``);
  lines.push(`## Writes`);
  lines.push(``);
  if (writes && writes.length > 0) {
    for (const w of writes) {
      lines.push(`### id=${w.id}`);
      lines.push(``);
      lines.push("```sql");
      lines.push(`UPDATE positions SET condition_id = '${w.after.condition_id}', updated_at = '${timestamp}' WHERE id = ${w.id} AND status = 'open' AND condition_id IS NULL;`);
      lines.push("```");
      lines.push(``);
      lines.push(`- **rows_changed:** ${w.rows_changed}`);
      lines.push(`- **Before:** condition_id = ${w.before.condition_id === null ? "NULL" : w.before.condition_id}`);
      lines.push(`- **After:** condition_id = ${w.after.condition_id}`);
      lines.push(``);
    }
  } else {
    lines.push(`No writes performed (nothing to backfill).`);
    lines.push(``);
  }
  lines.push(`## Post-State`);
  lines.push(``);
  lines.push(`Open positions with NULL condition_id: **0**`);
  lines.push(``);
  lines.push(`Total open positions: **${postTotal}**`);

  const report = lines.join("\n");
  require("fs").writeFileSync("condition_id_backfill.md", report, "utf8");
  console.log(`\n[REPORT] Written to condition_id_backfill.md`);
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
