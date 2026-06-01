require("dotenv").config();
const { ethers } = require("ethers");

// Correct Gnosis CTF formula:
// collectionId = parentCollectionId XOR keccak256(abi.encodePacked(conditionId, indexSet))
// positionId   = uint256(keccak256(abi.encodePacked(collateralToken, collectionId)))

function computePositionId(collateral, condId, indexSet, parentCollectionId) {
  const parent = parentCollectionId || ethers.constants.HashZero;
  const inner = ethers.utils.keccak256(
    ethers.utils.solidityPack(["bytes32", "uint256"], [condId, indexSet])
  );
  // XOR
  const parentBN = ethers.BigNumber.from(parent);
  const innerBN  = ethers.BigNumber.from(inner);
  const collectionId = ethers.utils.hexZeroPad(parentBN.xor(innerBN).toHexString(), 32);

  const posId = ethers.BigNumber.from(
    ethers.utils.keccak256(ethers.utils.solidityPack(["address", "bytes32"], [collateral, collectionId]))
  ).toString();
  return { collectionId, posId };
}

async function diagnose() {
  const pUSD_ADDR = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
  const USDC_E    = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

  // === Verify formula against known Solary position (USDC.e, outcome 1 → indexSet=2) ===
  console.log("=== Formula verification (Solary, USDC.e, indexSet=2) ===");
  const solaryCond    = "0x1a50773e4eeb903115d8017c5989b9760641aa63a41074d0060b4416c65fb54f";
  const solaryKnownId = "81273843018050116075956161527153440195727076923967631382662298499552121963863";
  for (const [label, coll] of [["pUSD", pUSD_ADDR], ["USDC.e", USDC_E]]) {
    for (const idx of [1, 2]) {
      const { posId } = computePositionId(coll, solaryCond, idx);
      const ok = posId === solaryKnownId;
      if (ok) console.log(`MATCH: ${label} indexSet=${idx} => ${posId}`);
    }
  }

  // === Investigate "Under" market ===
  console.log("\n=== Under market — find collateral ===");
  const underCond    = "0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e";
  const underTokenId = "96879728524724829206778105208231612105108933371818952028537619813955011537087";
  let found = false;
  for (const [label, coll] of [["pUSD", pUSD_ADDR], ["USDC.e", USDC_E]]) {
    for (const idx of [1, 2]) {
      const { collectionId, posId } = computePositionId(coll, underCond, idx);
      if (posId === underTokenId) {
        console.log(`MATCH: ${label} indexSet=${idx}`);
        console.log(`  collectionId: ${collectionId}`);
        console.log(`  positionId:   ${posId}`);
        found = true;
      }
    }
  }
  if (!found) console.log("No match with standard formula (pUSD or USDC.e, idx 1 or 2)");

  // === Print all computed IDs for Under market ===
  console.log("\n=== All computed IDs for Under market ===");
  for (const [label, coll] of [["pUSD", pUSD_ADDR], ["USDC.e", USDC_E]]) {
    for (const idx of [1, 2]) {
      const { posId } = computePositionId(coll, underCond, idx);
      console.log(`${label} idx${idx}: ${posId}`);
    }
  }
  console.log(`CLOB token_id:  ${underTokenId}`);

  // === Gamma API by slug/question ===
  console.log("\n=== Gamma API search for NBA 76ers O/U 213.5 ===");
  try {
    const r = await fetch("https://gamma-api.polymarket.com/markets?slug=nba-phi-bos-2026-04-28-total-213pt5");
    if (r.ok) {
      const d = await r.json();
      const markets = Array.isArray(d) ? d : (d.markets || [d]);
      for (const m of markets.slice(0, 3)) {
        console.log("  question:", m.question);
        console.log("  conditionId:", m.conditionId);
        console.log("  clobTokenIds:", m.clobTokenIds?.toString().slice(0, 100));
        console.log("  negRisk:", m.negRisk);
        console.log("  closed:", m.closed);
      }
    } else {
      console.log("  status:", r.status);
    }
  } catch (e) { console.log("  error:", e.message); }

  // Also try by question
  try {
    const r = await fetch("https://gamma-api.polymarket.com/markets?q=76ers+Celtics+213.5");
    if (r.ok) {
      const d = await r.json();
      const markets = Array.isArray(d) ? d : (d.markets || [d]);
      for (const m of markets.slice(0, 5)) {
        if (m.question?.includes("213")) {
          console.log("\n  [via question search]");
          console.log("  question:", m.question);
          console.log("  conditionId:", m.conditionId);
          console.log("  clobTokenIds:", m.clobTokenIds?.toString().slice(0, 100));
          console.log("  negRisk:", m.negRisk);
        }
      }
    }
  } catch (e) {}
}

diagnose().catch(e => { console.error("FATAL:", e); process.exit(1); });
