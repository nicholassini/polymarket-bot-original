require("dotenv").config();
const { ethers } = require("ethers");

async function check() {
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const WALLET = "0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935";
  const TOKEN_ID = "81273843018050116075956161527153440195727076923967631382662298499552121963863";
  
  const CTF = new ethers.Contract("0x4D97DCd97eC945f40cF65F87097ACe5EA0476045", [
    "function balanceOf(address,uint256) view returns (uint256)"
  ], provider);

  // Check if tokens were consumed by the failed redemption
  const bal = await CTF.balanceOf(WALLET, TOKEN_ID);
  console.log("Token balance after redemption attempt:", bal.toString(), "(" + ethers.utils.formatUnits(bal, 6) + " shares)");

  // Check if this is a neg risk market by looking at the Neg Risk Adapter
  const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";
  const NRA_ABI = [
    "function getDetermined(bytes32) view returns (bool)",
    "function getQuestionCount(bytes32) view returns (uint256)"
  ];
  
  // The market_id/conditionId might actually be a questionId under a neg risk group
  // Let's check the CLOB for more info
  const marketId = "0x1a50773e4eeb903115d8017c5989b9760641aa63a41074d0060b4416c65fb54f";
  
  // Try fetching from CLOB with the 0x-prefixed market ID
  try {
    const r = await fetch("https://clob.polymarket.com/markets/" + marketId);
    if (r.ok) {
      const d = await r.json();
      console.log("\nCLOB market data:");
      console.log("  neg_risk:", d.neg_risk);
      console.log("  condition_id:", d.condition_id);
      console.log("  question_id:", d.question_id);
      console.log("  tokens:", JSON.stringify(d.tokens?.map(t => ({o: t.outcome, id: t.token_id?.slice(0,20)}))));
      console.log("  active:", d.active);
      console.log("  closed:", d.closed);
    } else {
      console.log("CLOB /markets/ returned", r.status);
    }
  } catch(e) { console.log("CLOB error:", e.message); }

  // Also try the condition endpoint
  try {
    const r = await fetch("https://clob.polymarket.com/conditions/" + marketId);
    if (r.ok) {
      const d = await r.json();
      console.log("\nCLOB condition data:", JSON.stringify(d, null, 2).slice(0, 500));
    }
  } catch(e) {}
}

check().catch(console.error);
