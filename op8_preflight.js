/**
 * op8_preflight.js — Step 1–2 of Position #8 redemption
 * Reads DB, fetches CLOB, checks on-chain CTF balance, oracle state,
 * and pre-redemption collateral balances (pUSD + USDC.e).
 * READ-ONLY. No transactions.
 */
require("dotenv").config();
const Database = require("better-sqlite3");
const { ethers } = require("ethers");
const path = require("path");

const WALLET      = "0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935";
const CTF_ADDR    = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const PUSD_ADDR   = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDCE_ADDR  = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CONDITION_ID = "0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e";
const DB_PATH     = path.join(__dirname, ".runtime", "trades.db");

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC_URL);

  const CTF = new ethers.Contract(CTF_ADDR, [
    "function payoutNumerators(bytes32,uint256) view returns (uint256)",
    "function payoutDenominator(bytes32) view returns (uint256)",
    "function balanceOf(address,uint256) view returns (uint256)",
  ], provider);

  const erc20Abi = ["function balanceOf(address) view returns (uint256)"];
  const pUSD  = new ethers.Contract(PUSD_ADDR,  erc20Abi, provider);
  const usdce = new ethers.Contract(USDCE_ADDR, erc20Abi, provider);

  // ── Step 1: DB read ─────────────────────────────────────────────────────────
  console.log("════════════════════════════════════════");
  console.log("STEP 1 — DB row for id=8");
  console.log("════════════════════════════════════════");

  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare("SELECT * FROM positions WHERE id = 8").get();
  db.close();

  if (!row) {
    console.error("FATAL: No row with id=8 in positions table. HALT.");
    process.exit(1);
  }

  console.log("  id         :", row.id);
  console.log("  wallet_id  :", row.wallet_id);
  console.log("  market_id  :", row.market_id);
  console.log("  token_id   :", row.token_id);
  console.log("  condition_id:", row.condition_id);
  console.log("  outcome    :", row.outcome);
  console.log("  side       :", row.side);
  console.log("  size       :", row.size);
  console.log("  avg_price  :", row.avg_price);
  console.log("  total_cost :", row.total_cost);
  console.log("  realized_pnl:", row.realized_pnl);
  console.log("  status     :", row.status);
  console.log("  opened_at  :", row.opened_at);

  if (row.status !== "open") {
    console.error(`HALT: status='${row.status}', expected 'open'. Do not proceed.`);
    process.exit(1);
  }
  console.log("  ✔ status=open — OK");

  // Validate conditionId in DB matches what we expect
  if (row.condition_id && row.condition_id.toLowerCase() !== CONDITION_ID.toLowerCase()) {
    console.warn(`  WARN: DB condition_id '${row.condition_id}' does NOT match hardcoded '${CONDITION_ID}'`);
    console.warn("  Proceeding with DB condition_id.");
  } else if (!row.condition_id) {
    console.warn("  WARN: DB condition_id is null — using hardcoded value.");
  }

  const tokenId = row.token_id;
  const conditionId = row.condition_id || CONDITION_ID;

  if (!tokenId) {
    console.error("FATAL: token_id is null in DB. Cannot proceed.");
    process.exit(1);
  }

  // ── Step 2: CLOB market fetch ────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("STEP 2 — CLOB market fetch");
  console.log("════════════════════════════════════════");

  let clob;
  try {
    const resp = await fetch(`https://clob.polymarket.com/markets/${conditionId}`);
    if (!resp.ok) {
      console.error(`CLOB HTTP ${resp.status}. Proceeding with DB token_id (unverified via CLOB).`);
    } else {
      clob = await resp.json();
    }
  } catch (e) {
    console.error("CLOB fetch error:", e.message);
  }

  let ourOutcomeIndex = null;
  let ourIndexSet = null;

  if (clob) {
    console.log("  closed   :", clob.closed);
    console.log("  active   :", clob.active);
    console.log("  neg_risk :", clob.neg_risk);
    console.log("  condition_id:", clob.condition_id);
    console.log("  tokens:");

    if (Array.isArray(clob.tokens)) {
      clob.tokens.forEach((t, i) => {
        const match = t.token_id === tokenId;
        console.log(`    [${i}] outcome="${t.outcome}"  token_id="${t.token_id}"${match ? "  ← OUR TOKEN" : ""}`);
        if (match) {
          ourOutcomeIndex = i;
          ourIndexSet = 1 << i;
          if (t.outcome !== row.outcome) {
            console.warn(`    ⚠ CLOB outcome "${t.outcome}" != DB outcome "${row.outcome}" — FLAG THIS.`);
          } else {
            console.log(`    ✔ CLOB outcome matches DB outcome ("${row.outcome}")`);
          }
        }
      });

      if (ourOutcomeIndex === null) {
        console.error("  *** Our token_id not found in CLOB tokens array! ***");
        console.error("  DB token_id:", tokenId);
        console.error("  CLOB tokens:", clob.tokens.map(t => t.token_id).join(", "));
        console.error("  HALT — cannot derive indexSet without CLOB confirmation.");
        process.exit(1);
      }

      console.log(`\n  DERIVED: outcomeIndex=${ourOutcomeIndex}, indexSet=${ourIndexSet}`);
    } else {
      console.error("  CLOB returned no tokens array. Cannot derive indexSet.");
      process.exit(1);
    }
  } else {
    console.error("HALT: CLOB unavailable and we cannot derive indexSet safely.");
    process.exit(1);
  }

  // ── Step 3: On-chain CTF balance ─────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("STEP 3 — On-chain CTF token balance");
  console.log("════════════════════════════════════════");

  const ctfBal = await CTF.balanceOf(WALLET, tokenId);
  console.log("  token_id     :", tokenId);
  console.log("  raw balance  :", ctfBal.toString());
  console.log("  human (6 dec):", ethers.utils.formatUnits(ctfBal, 6));

  if (ctfBal.eq(0)) {
    console.error("  *** CTF balance is ZERO — position may already be redeemed or never minted. HALT. ***");
    process.exit(1);
  }
  const expected5 = ethers.BigNumber.from("5000000");
  const close = ctfBal.gte(ethers.BigNumber.from("4900000")) && ctfBal.lte(ethers.BigNumber.from("5100000"));
  console.log(`  ✔ Non-zero balance. Expected ~5,000,000. Within 2% of 5: ${close}`);

  // ── Step 4: Oracle settlement state ──────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("STEP 4 — Oracle settlement state");
  console.log("════════════════════════════════════════");

  const denom = await CTF.payoutDenominator(conditionId);
  const num0  = await CTF.payoutNumerators(conditionId, 0);
  const num1  = await CTF.payoutNumerators(conditionId, 1);

  console.log("  payoutDenominator :", denom.toString(), denom.gt(0) ? "(settled ✔)" : "(NOT settled — HALT)");
  console.log("  payoutNumerators[0]:", num0.toString());
  console.log("  payoutNumerators[1]:", num1.toString());

  if (denom.eq(0)) {
    console.error("  HALT: payoutDenominator=0 means oracle has not settled this condition.");
    process.exit(1);
  }

  const ourNumerator = ourOutcomeIndex === 0 ? num0 : num1;
  if (ourNumerator.eq(0)) {
    console.error(`  HALT: Our outcome index ${ourOutcomeIndex} has numerator=0. We did NOT win.`);
  } else {
    console.log(`  ✔ Our outcome index ${ourOutcomeIndex} numerator=${ourNumerator.toString()} > 0. We WON.`);
  }

  // ── Step 2.1: Pre-redemption collateral balances ──────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("STEP 2.1 — Pre-redemption collateral balances (baseline)");
  console.log("════════════════════════════════════════");

  const pusdBal  = await pUSD.balanceOf(WALLET);
  const usdceBal = await usdce.balanceOf(WALLET);

  console.log("  pUSD balance  :", pusdBal.toString(), "raw |", ethers.utils.formatUnits(pusdBal, 6), "pUSD");
  console.log("  USDC.e balance:", usdceBal.toString(), "raw |", ethers.utils.formatUnits(usdceBal, 6), "USDC.e");

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("PREFLIGHT SUMMARY");
  console.log("════════════════════════════════════════");
  console.log("  DB id=8 status=open                 :", row.status === "open" ? "✔" : "✗");
  console.log("  token_id in CLOB tokens             :", ourOutcomeIndex !== null ? "✔" : "✗");
  console.log("  CLOB outcome matches DB             :", clob?.tokens?.[ourOutcomeIndex]?.outcome === row.outcome ? "✔" : "✗");
  console.log("  CTF balance non-zero                :", ctfBal.gt(0) ? "✔" : "✗");
  console.log("  Oracle settled (denom > 0)          :", denom.gt(0) ? "✔" : "✗");
  console.log("  Our outcome index has numerator > 0 :", ourNumerator.gt(0) ? "✔" : "✗");
  console.log("\n  Derived indexSet for redemption     :", ourIndexSet);
  console.log("  Baseline pUSD  (raw)                :", pusdBal.toString());
  console.log("  Baseline USDC.e (raw)               :", usdceBal.toString());
  console.log("\nNext step: run op8_probe_collateral.js to confirm USDC.e is the correct collateral.");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
