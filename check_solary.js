require("dotenv").config();
const { ethers } = require("ethers");
const Database = require("better-sqlite3");
const db = new Database(".runtime/trades.db");

async function check() {
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const CTF_ABI = ["function balanceOf(address,uint256) view returns (uint256)"];
  const ctf = new ethers.Contract("0x4D97DCd97eC945f40cF65F87097ACe5EA0476045", CTF_ABI, provider);
  const WALLET = "0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935";

  // Get the exact token_id from DB
  const solary = db.prepare("SELECT * FROM positions WHERE outcome='Solary'").get();
  console.log("DB token_id:", solary.token_id);
  console.log("DB market_id:", solary.market_id);
  console.log("DB status:", solary.status);
  console.log("DB size:", solary.size);
  console.log("DB cost:", solary.total_cost);

  // Check balance with exact DB token
  const bal = await ctf.balanceOf(WALLET, solary.token_id);
  console.log("\nCTF balance (DB token):", bal.toString(), "raw");
  console.log("CTF balance (formatted):", ethers.utils.formatUnits(bal, 6));

  // Check Gamma for market details
  const r = await fetch("https://gamma-api.polymarket.com/markets?clob_token_ids=" + solary.token_id);
  const markets = await r.json();
  if (markets.length > 0) {
    const m = markets[0];
    console.log("\nGamma market:", m.question);
    console.log("Gamma negRisk:", m.negRisk);
    console.log("Gamma active:", m.active);
    console.log("Gamma closed:", m.closed);
    console.log("Gamma resolved:", m.resolved);
  } else {
    console.log("\nNo Gamma match for this token");
  }

  // Check pUSD balance
  const pUSD = new ethers.Contract(
    "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  const pusdBal = await pUSD.balanceOf(WALLET);
  console.log("\nCurrent pUSD:", ethers.utils.formatUnits(pusdBal, 6));

  // Also check: did pUSD go UP since last known ($25.17)?
  // If tokens were auto-redeemed, balance would be higher
  console.log("Expected if redeemed: ~$30.17");
}

check().catch(console.error);
