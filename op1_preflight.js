require("dotenv").config();
const { ethers } = require("ethers");

async function preflight() {
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const WALLET = "0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935";

  // Position #7 from report = DB id=8
  const conditionId = "0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e";
  const tokenId    = "96879728524724829206778105208231612105108933371818952028537619813955011537087";
  const pUSD_ADDR  = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

  const CTF = new ethers.Contract("0x4D97DCd97eC945f40cF65F87097ACe5EA0476045", [
    "function payoutNumerators(bytes32,uint256) view returns (uint256)",
    "function payoutDenominator(bytes32) view returns (uint256)",
    "function balanceOf(address,uint256) view returns (uint256)"
  ], provider);

  const pUSDContract = new ethers.Contract(pUSD_ADDR, [
    "function balanceOf(address) view returns (uint256)"
  ], provider);

  // 1. CLOB check
  console.log("=== CLOB market check ===");
  try {
    const r = await fetch("https://clob.polymarket.com/markets/" + conditionId);
    if (r.ok) {
      const d = await r.json();
      console.log("  closed:", d.closed);
      console.log("  active:", d.active);
      console.log("  neg_risk:", d.neg_risk);
      console.log("  condition_id:", d.condition_id);
      console.log("  tokens:");
      if (d.tokens) {
        d.tokens.forEach((t, i) => {
          console.log(`    [${i}] outcome="${t.outcome}" token_id="${t.token_id}"`);
          if (t.token_id === tokenId) {
            console.log(`        ^ THIS IS OUR TOKEN (outcome index=${i})`);
          }
        });
      }
    } else {
      console.log("  CLOB returned status:", r.status);
    }
  } catch (e) {
    console.log("  CLOB error:", e.message);
  }

  // 2. On-chain CTF balance
  console.log("\n=== On-chain CTF token balance ===");
  const ctfBal = await CTF.balanceOf(WALLET, tokenId);
  console.log("  Token ID:", tokenId);
  console.log("  Raw balance:", ctfBal.toString());
  console.log("  Human units (6 dec):", ethers.utils.formatUnits(ctfBal, 6));
  if (ctfBal.eq(0)) {
    console.log("  *** ZERO BALANCE — HALT CONDITION ***");
  } else {
    console.log("  Expected ~5000000 (5 tokens). OK:", ctfBal.gte(ethers.utils.parseUnits("4.9", 6)));
  }

  // 3. Payout oracle state
  console.log("\n=== Payout oracle ===");
  const denom = await CTF.payoutDenominator(conditionId);
  console.log("  payoutDenominator:", denom.toString(), denom.gt(0) ? "(settled)" : "(NOT settled — HALT)");

  const num0 = await CTF.payoutNumerators(conditionId, 0);
  const num1 = await CTF.payoutNumerators(conditionId, 1);
  console.log("  payoutNumerators[0]:", num0.toString());
  console.log("  payoutNumerators[1]:", num1.toString());

  // Determine which outcome index is "Under" winner
  // Token ID from DB is 96879728... — compare with CLOB tokens above to determine outcome index
  // We'll figure out from above printout which index is winning
  if (denom.gt(0)) {
    if (num0.eq(1)) console.log("  => outcome 0 WINS, indexSet = 1");
    if (num1.eq(1)) console.log("  => outcome 1 WINS, indexSet = 2");
  }

  // 4. pUSD balance
  console.log("\n=== pUSD balance (pre-redemption) ===");
  const pusdBal = await pUSDContract.balanceOf(WALLET);
  console.log("  pUSD balance:", ethers.utils.formatUnits(pusdBal, 6), "(raw:", pusdBal.toString() + ")");

  // Summary
  console.log("\n=== SUMMARY ===");
  const ok = !ctfBal.eq(0) && denom.gt(0);
  console.log("  Ready to redeem:", ok);
  if (!ok) console.log("  *** HALT CONDITIONS PRESENT — DO NOT PROCEED ***");
}

preflight().catch(e => { console.error("FATAL:", e); process.exit(1); });
