/**
 * op8_redeem.js — Steps 3–5: Execute redemption, post-flight verify, DB close
 *
 * ONLY run after op8_probe_collateral.js exits 0 (USDC.e confirmed).
 *
 * Step 3: CTF.redeemPositions(USDC_E, HashZero, conditionId, [indexSet])
 * Step 4: Post-flight verification (USDC.e delta, pUSD unchanged, CTF balance=0)
 * Step 5: DB close (UPDATE positions SET status='closed', realized_pnl=...)
 *
 * HALT conditions:
 *   - payout == 0 in PayoutRedemption event
 *   - USDC.e balance did not increase
 *   - CTF balance not zero after redeem
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

// Gas settings
const MAX_PRIORITY_FEE = ethers.utils.parseUnits("35", "gwei");
const MAX_FEE          = ethers.utils.parseUnits("150", "gwei");

const CTF_ABI = [
  "function payoutNumerators(bytes32,uint256) view returns (uint256)",
  "function payoutDenominator(bytes32) view returns (uint256)",
  "function balanceOf(address,uint256) view returns (uint256)",
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata indexSets) external",
  "event PayoutRedemption(address indexed redeemer, address indexed collateralToken, bytes32 indexed parentCollectionId, bytes32 conditionId, uint256[] indexSets, uint256 payout)",
];

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

async function main() {
  const pk = process.env.POLYMARKET_PRIVATE_KEY;
  if (!pk) { console.error("FATAL: POLYMARKET_PRIVATE_KEY not set"); process.exit(1); }

  const provider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
  const signer   = new ethers.Wallet(pk, provider);

  if (signer.address.toLowerCase() !== WALLET.toLowerCase()) {
    console.error(`FATAL: Signer address ${signer.address} != expected ${WALLET}`);
    process.exit(1);
  }

  const CTF   = new ethers.Contract(CTF_ADDR,   CTF_ABI,  signer);
  const pUSD  = new ethers.Contract(PUSD_ADDR,  ERC20_ABI, provider);
  const usdce = new ethers.Contract(USDCE_ADDR, ERC20_ABI, provider);

  // ── Step 3 pre-check: re-read DB to confirm id=8, get token_id / indexSet / total_cost ──
  console.log("════════════════════════════════════════");
  console.log("STEP 3 PRE-CHECK — Re-read DB and on-chain state");
  console.log("════════════════════════════════════════");

  const db_ro = new Database(DB_PATH, { readonly: true });
  const row = db_ro.prepare("SELECT * FROM positions WHERE id = 8").get();
  db_ro.close();

  if (!row) { console.error("FATAL: No row id=8"); process.exit(1); }
  if (row.status !== "open") { console.error(`HALT: status='${row.status}' (not open)`); process.exit(1); }

  console.log("  DB row:");
  console.log("    id         :", row.id);
  console.log("    token_id   :", row.token_id);
  console.log("    outcome    :", row.outcome);
  console.log("    size       :", row.size);
  console.log("    total_cost :", row.total_cost);
  console.log("    status     :", row.status);

  const tokenId = row.token_id;
  const totalCost = row.total_cost; // in dollars (from DB)

  // Re-derive indexSet from CLOB
  let indexSet;
  try {
    const r = await fetch(`https://clob.polymarket.com/markets/${CONDITION_ID}`);
    if (!r.ok) throw new Error(`CLOB HTTP ${r.status}`);
    const market = await r.json();
    if (!Array.isArray(market.tokens)) throw new Error("No tokens array in CLOB response");
    const idx = market.tokens.findIndex(t => t.token_id === tokenId);
    if (idx === -1) throw new Error(`token_id ${tokenId} not in CLOB tokens: ${market.tokens.map(t => t.token_id).join(", ")}`);
    indexSet = 1 << idx;
    console.log(`  CLOB derived: outcomeIndex=${idx}, indexSet=${indexSet} (token at array position ${idx})`);
    console.log(`  CLOB outcome: "${market.tokens[idx].outcome}" | DB outcome: "${row.outcome}"`);
    if (market.tokens[idx].outcome !== row.outcome) {
      console.error(`  *** MISMATCH: CLOB outcome "${market.tokens[idx].outcome}" != DB "${row.outcome}". HALT. ***`);
      process.exit(1);
    }
  } catch (e) {
    console.error("FATAL: Cannot re-derive indexSet from CLOB:", e.message);
    process.exit(1);
  }

  // Confirm oracle settlement
  const denom = await CTF.payoutDenominator(CONDITION_ID);
  if (denom.eq(0)) { console.error("HALT: Oracle not settled."); process.exit(1); }
  const ourIdx = Math.log2(indexSet); // 1<<idx -> idx
  const num = await CTF.payoutNumerators(CONDITION_ID, ourIdx);
  if (num.eq(0)) { console.error(`HALT: payoutNumerators[${ourIdx}]=0, we did not win.`); process.exit(1); }
  console.log(`  Oracle: denom=${denom}, num[${ourIdx}]=${num} — settled and we won ✔`);

  // CTF balance
  const ctfBalPre = await CTF.balanceOf(WALLET, tokenId);
  if (ctfBalPre.eq(0)) { console.error("HALT: CTF balance is 0 pre-redemption."); process.exit(1); }
  console.log(`  CTF balance pre: ${ctfBalPre.toString()} (${ethers.utils.formatUnits(ctfBalPre, 6)})`);

  // Pre-redemption balances
  const pusdPre  = await pUSD.balanceOf(WALLET);
  const usdcePre = await usdce.balanceOf(WALLET);
  console.log(`  pUSD pre  : ${pusdPre.toString()}  (${ethers.utils.formatUnits(pusdPre, 6)})`);
  console.log(`  USDC.e pre: ${usdcePre.toString()} (${ethers.utils.formatUnits(usdcePre, 6)})`);

  // ── Step 3: Submit redemption ─────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("STEP 3 — Submitting CTF.redeemPositions");
  console.log("════════════════════════════════════════");
  console.log("  collateralToken      :", USDCE_ADDR, "(USDC.e)");
  console.log("  parentCollectionId   : 0x000...0 (HashZero)");
  console.log("  conditionId          :", CONDITION_ID);
  console.log("  indexSets            :", [indexSet]);
  console.log("  maxPriorityFeePerGas :", MAX_PRIORITY_FEE.toString(), "wei (35 gwei)");
  console.log("  maxFeePerGas         :", MAX_FEE.toString(), "wei (150 gwei)");

  let tx;
  try {
    tx = await CTF.redeemPositions(
      USDCE_ADDR,
      ethers.constants.HashZero,
      CONDITION_ID,
      [indexSet],
      {
        maxPriorityFeePerGas: MAX_PRIORITY_FEE,
        maxFeePerGas:         MAX_FEE,
      }
    );
  } catch (e) {
    console.error("FATAL: redeemPositions call failed:", e.message);
    if (e.data) console.error("  Revert data:", e.data);
    process.exit(1);
  }

  console.log(`  TX submitted: ${tx.hash}`);
  console.log("  Waiting for receipt...");

  let receipt;
  try {
    receipt = await tx.wait(1);
  } catch (e) {
    console.error("FATAL: TX reverted or wait failed:", e.message);
    process.exit(1);
  }

  console.log(`  TX mined in block ${receipt.blockNumber}`);
  console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
  console.log(`  Status: ${receipt.status === 1 ? "SUCCESS ✔" : "REVERTED ✗"}`);

  if (receipt.status !== 1) {
    console.error("HALT: TX reverted on-chain.");
    process.exit(1);
  }

  // ── Decode PayoutRedemption event ────────────────────────────────────────
  console.log("\n─── Decoding PayoutRedemption event ───");

  const iface = new ethers.utils.Interface([
    "event PayoutRedemption(address indexed redeemer, address indexed collateralToken, bytes32 indexed parentCollectionId, bytes32 conditionId, uint256[] indexSets, uint256 payout)"
  ]);

  let payoutRedemptionEvent = null;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === "PayoutRedemption") {
        payoutRedemptionEvent = parsed;
        break;
      }
    } catch {}
  }

  if (!payoutRedemptionEvent) {
    console.error("HALT: No PayoutRedemption event found in receipt logs.");
    console.error("  Logs count:", receipt.logs.length);
    receipt.logs.forEach((l, i) => console.error(`  log[${i}]: topics[0]=${l.topics[0]}`));
    process.exit(1);
  }

  const { redeemer, collateralToken, parentCollectionId, conditionId, indexSets, payout } = payoutRedemptionEvent.args;
  console.log("  redeemer             :", redeemer);
  console.log("  collateralToken      :", collateralToken);
  console.log("  parentCollectionId   :", parentCollectionId);
  console.log("  conditionId          :", conditionId);
  console.log("  indexSets            :", indexSets.map(x => x.toString()).join(", "));
  console.log("  payout               :", payout.toString(), `(${ethers.utils.formatUnits(payout, 6)} USDC.e)`);

  if (payout.eq(0)) {
    console.error("\n*** HALT: payout == 0. Position did not pay out. ***");
    console.error("Candidate explanations:");
    console.error("  1. Loser — payoutNumerators for our outcome is 0 (re-check on-chain)");
    console.error("  2. Wrong collateral — USDC.e accepted by CTF but not the original collateral");
    console.error("  3. Wrong indexSet — try the other: indexSet =", indexSet === 1 ? 2 : 1);
    console.error("  4. Already redeemed — CTF balance was consumed already");
    console.error(`  CTF balance pre-redemption was: ${ctfBalPre.toString()}`);
    process.exit(1);
  }

  console.log(`  ✔ payout > 0: ${ethers.utils.formatUnits(payout, 6)} USDC.e`);

  // ── Step 4: Post-flight verification ────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("STEP 4 — Post-flight verification");
  console.log("════════════════════════════════════════");

  const pusdPost  = await pUSD.balanceOf(WALLET);
  const usdcePost = await usdce.balanceOf(WALLET);
  const ctfBalPost = await CTF.balanceOf(WALLET, tokenId);

  const usdceDelta = usdcePost.sub(usdcePre);
  const pusdDelta  = pusdPost.sub(pusdPre);

  console.log("  USDC.e pre :", usdcePre.toString(), `(${ethers.utils.formatUnits(usdcePre, 6)})`);
  console.log("  USDC.e post:", usdcePost.toString(), `(${ethers.utils.formatUnits(usdcePost, 6)})`);
  console.log("  USDC.e Δ   :", usdceDelta.toString(), `(${ethers.utils.formatUnits(usdceDelta, 6)}) ← payout received`);
  console.log("  pUSD pre   :", pusdPre.toString());
  console.log("  pUSD post  :", pusdPost.toString());
  console.log("  pUSD Δ     :", pusdDelta.toString(), pusdDelta.eq(0) ? "(unchanged ✔)" : "(*** CHANGED — unexpected ***)");
  console.log("  CTF balance post:", ctfBalPost.toString(), ctfBalPost.eq(0) ? "(zero ✔)" : "(*** NON-ZERO ***)");

  // Halt checks
  if (usdceDelta.lte(0)) {
    console.error("HALT: USDC.e balance did not increase. Something is wrong.");
    process.exit(1);
  }
  if (!pusdDelta.eq(0)) {
    console.error("HALT: pUSD balance changed unexpectedly.");
    process.exit(1);
  }
  if (!ctfBalPost.eq(0)) {
    console.error("HALT: CTF balance is non-zero after redemption. Unexpected.");
    process.exit(1);
  }

  console.log("  ✔ All post-flight checks passed.");

  // Compute realized PnL
  // total_cost in DB is in dollars; USDC.e delta is also in dollar-equivalent (6 decimals, 1:1)
  const usdceDeltaFloat = parseFloat(ethers.utils.formatUnits(usdceDelta, 6));
  const realizedPnl = usdceDeltaFloat - totalCost;
  console.log(`\n  total_cost (DB)     : $${totalCost}`);
  console.log(`  USDC.e received     : $${usdceDeltaFloat.toFixed(6)}`);
  console.log(`  realized_pnl        : $${realizedPnl.toFixed(6)}`);

  // ── Step 5: DB close ──────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("STEP 5 — DB close");
  console.log("════════════════════════════════════════");

  const now = new Date().toISOString();
  const db_rw = new Database(DB_PATH);

  // Show row before update
  const rowBefore = db_rw.prepare("SELECT * FROM positions WHERE id = 8").get();
  console.log("  Row BEFORE update:");
  console.log("    status      :", rowBefore.status);
  console.log("    realized_pnl:", rowBefore.realized_pnl);
  console.log("    closed_at   :", rowBefore.closed_at);

  const result = db_rw.prepare(`
    UPDATE positions
    SET status       = 'closed',
        realized_pnl = ?,
        closed_at    = ?,
        updated_at   = ?
    WHERE id = 8 AND status = 'open'
  `).run(realizedPnl, now, now);

  console.log(`  Rows changed: ${result.changes} (expected 1)`);

  if (result.changes !== 1) {
    console.error(`HALT: Expected 1 row changed, got ${result.changes}. DO NOT proceed.`);
    db_rw.close();
    process.exit(1);
  }

  const rowAfter = db_rw.prepare("SELECT * FROM positions WHERE id = 8").get();
  console.log("  Row AFTER update:");
  console.log("    status      :", rowAfter.status);
  console.log("    realized_pnl:", rowAfter.realized_pnl);
  console.log("    closed_at   :", rowAfter.closed_at);
  console.log("    updated_at  :", rowAfter.updated_at);

  db_rw.close();

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("REDEMPTION COMPLETE");
  console.log("════════════════════════════════════════");
  console.log(`  TX hash     : ${tx.hash}`);
  console.log(`  Block       : ${receipt.blockNumber}`);
  console.log(`  Gas used    : ${receipt.gasUsed.toString()}`);
  console.log(`  Payout      : ${ethers.utils.formatUnits(payout, 6)} USDC.e`);
  console.log(`  PnL         : $${realizedPnl.toFixed(6)}`);
  console.log(`  DB id=8     : closed ✔`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
