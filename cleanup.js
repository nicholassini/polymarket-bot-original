require("dotenv").config();
const { ethers } = require("ethers");
const Database = require("better-sqlite3");
const db = new Database(".runtime/trades.db");

async function cleanup() {
  // 1. Check current pUSD balance
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const pUSD = new ethers.Contract(
    "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  const bal = await pUSD.balanceOf("0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935");
  console.log("Current pUSD balance:", ethers.utils.formatUnits(bal, 6));

  // 2. Show the 4 broken positions before closing
  const broken = db.prepare(
    "SELECT id, market_id, outcome, total_cost, size FROM positions WHERE token_id IS NULL AND status='open'"
  ).all();
  console.log("\nPositions to close as resolved (no on-chain tokens):");
  let totalLoss = 0;
  for (const p of broken) {
    console.log("  #" + p.id, "| cost: $" + p.total_cost, "| size:", p.size, "| market:", p.market_id);
    totalLoss += p.total_cost;
  }
  console.log("Total cost of phantom positions: $" + totalLoss.toFixed(2));

  // 3. Close them as losses
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "UPDATE positions SET status='closed', closed_at=?, realized_pnl=(-total_cost), updated_at=? WHERE id=?"
  );
  for (const p of broken) {
    stmt.run(now, now, p.id);
  }
  console.log("\nClosed " + broken.length + " phantom positions as losses");

  // 4. Summary
  const open = db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='open'").get();
  const closed = db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='closed'").get();
  console.log("Open positions: " + open.c);
  console.log("Closed positions: " + closed.c);

  // 5. Also check Solary redemption
  const ctf = new ethers.Contract(
    "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
    ["function payoutDenominator(bytes32) view returns (uint256)"],
    provider
  );
  const denom = await ctf.payoutDenominator(
    "0x1a50773e4eeb903115d8017c5989b9760641aa63a41074d0060b4416c65fb54f"
  );
  console.log("\nSolary payout denominator:", denom.toString(), denom.gt(0) ? "-> REDEEMABLE!" : "-> not yet settled");
}

cleanup().catch(console.error);
