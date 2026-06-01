require("dotenv").config();
const { ethers } = require("ethers");

async function diagnose() {
  const pUSD_ADDR = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
  const USDC_E    = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  const PARENT    = ethers.constants.HashZero;

  function computePositionId(collateral, condId, indexSet) {
    const collectionId = ethers.utils.keccak256(
      ethers.utils.solidityPack(["bytes32", "bytes32", "uint256"], [PARENT, condId, indexSet])
    );
    const posId = ethers.BigNumber.from(
      ethers.utils.keccak256(ethers.utils.solidityPack(["address", "bytes32"], [collateral, collectionId]))
    ).toString();
    return posId;
  }

  // === Verify formula against known Solary position ===
  console.log("=== Formula verification (Solary) ===");
  const solaryCond = "0x1a50773e4eeb903115d8017c5989b9760641aa63a41074d0060b4416c65fb54f";
  const solaryKnownId = "81273843018050116075956161527153440195727076923967631382662298499552121963863";
  // Solary is outcome 1 (indexSet=2) per check_payout.js
  const solaryComputed_pUSD_1 = computePositionId(pUSD_ADDR, solaryCond, 2);
  const solaryComputed_USDC_1 = computePositionId(USDC_E, solaryCond, 2);
  const solaryComputed_pUSD_0 = computePositionId(pUSD_ADDR, solaryCond, 1);
  const solaryComputed_USDC_0 = computePositionId(USDC_E, solaryCond, 1);
  console.log("Known Solary token_id:", solaryKnownId);
  console.log("Computed pUSD  idx0:", solaryComputed_pUSD_0, solaryComputed_pUSD_0 === solaryKnownId ? "<MATCH>" : "");
  console.log("Computed pUSD  idx1:", solaryComputed_pUSD_1, solaryComputed_pUSD_1 === solaryKnownId ? "<MATCH>" : "");
  console.log("Computed USDC.e idx0:", solaryComputed_USDC_0, solaryComputed_USDC_0 === solaryKnownId ? "<MATCH>" : "");
  console.log("Computed USDC.e idx1:", solaryComputed_USDC_1, solaryComputed_USDC_1 === solaryKnownId ? "<MATCH>" : "");

  // === Investigate "Under" market ===
  console.log("\n=== Under market investigation ===");
  const underCond   = "0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e";
  const underTokenId = "96879728524724829206778105208231612105108933371818952028537619813955011537087";
  console.log("Known Under token_id:", underTokenId);
  for (const [label, coll] of [["pUSD", pUSD_ADDR], ["USDC.e", USDC_E]]) {
    for (const idx of [1, 2, 3]) {
      const pid = computePositionId(coll, underCond, idx);
      if (pid === underTokenId) console.log(`MATCH: [${label}] indexSet=${idx} => ${pid}`);
    }
  }
  console.log("(no output above = no match with standard formula)");

  // === Gamma API lookup ===
  console.log("\n=== Gamma API ===");
  try {
    const r = await fetch("https://gamma-api.polymarket.com/markets?condition_id=" + underCond);
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d) && d.length > 0) {
        const m = d[0];
        console.log("  question:", m.question);
        console.log("  slug:", m.slug);
        console.log("  neg_risk:", m.negRisk);
        console.log("  collateral_token:", m.collateralToken);
        console.log("  condition_id:", m.conditionId);
        console.log("  clobTokenIds:", JSON.stringify(m.clobTokenIds));
        console.log("  outcomePrices:", m.outcomePrices);
        console.log("  closed:", m.closed);
        console.log("  active:", m.active);
      } else {
        console.log("  No results:", JSON.stringify(d).slice(0, 200));
      }
    } else {
      console.log("  Gamma returned:", r.status);
    }
  } catch (e) { console.log("  Gamma error:", e.message); }

  // Also check Gamma by token_id
  console.log("\n=== Gamma by token_id ===");
  try {
    const r = await fetch("https://gamma-api.polymarket.com/markets?clob_token_ids=" + underTokenId);
    if (r.ok) {
      const d = await r.json();
      console.log("  Result:", JSON.stringify(d).slice(0, 500));
    }
  } catch (e) { console.log("  Error:", e.message); }
}

diagnose().catch(e => { console.error("FATAL:", e); process.exit(1); });
