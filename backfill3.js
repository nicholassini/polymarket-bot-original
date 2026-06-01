require("dotenv").config();
const { ethers } = require("ethers");
const Database = require("better-sqlite3");
const db = new Database(".runtime/trades.db");

const WALLET = "0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935";
const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const CTF_ABI = ["function balanceOf(address,uint256) view returns (uint256)"];

async function backfill() {
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const ctf = new ethers.Contract(CTF, CTF_ABI, provider);

  const broken = db.prepare(
    "SELECT id, order_id, market_id, outcome FROM trades WHERE token_id IS NULL"
  ).all();

  const updateTrade = db.prepare("UPDATE trades SET token_id = ? WHERE id = ?");
  const updatePos = db.prepare(
    "UPDATE positions SET token_id = ? WHERE market_id = ? AND outcome = ? AND token_id IS NULL"
  );

  // Market ID -> candidate token IDs from Gamma
  const candidates = {
    "1929841": { q: "Natus Vincere vs FaZe", tokens: ["48758486425438602097", "15257049085013287614"] },
    "2060735": { q: "Wild vs Stars O/U 5.5", tokens: ["11513857273458875201", "71332357885067235670"] },
    "2099081": { q: "Mariners vs Twins O/U 7.5", tokens: ["99523793727745791612", "11327062931135651295"] },
    "2000957": { q: "Atletico vs Arsenal O/U 1.5", tokens: ["11367619835036063149", "10833521409733066021"] },
  };

  for (const t of broken) {
    const c = candidates[t.market_id];
    if (!c) { console.log("No candidates for market", t.market_id); continue; }

    console.log("\n--- Trade #" + t.id + ": " + c.q);

    for (const tokenId of c.tokens) {
      try {
        const bal = await ctf.balanceOf(WALLET, tokenId);
        const balNum = Number(ethers.utils.formatUnits(bal, 6));
        console.log("  token " + tokenId.slice(0,20) + "... balance: " + balNum);
        if (bal.gt(0)) {
          updateTrade.run(tokenId, t.id);
          const r = updatePos.run(tokenId, t.market_id, t.outcome);
          console.log("  FIXED! Updated trade + " + r.changes + " position(s)");
        }
      } catch (e) {
        console.log("  Error checking " + tokenId.slice(0,20) + ":", e.message);
      }
    }
  }

  const left = db.prepare("SELECT COUNT(*) as c FROM positions WHERE token_id IS NULL AND status='open'").get();
  console.log("\nRemaining NULL positions:", left.c);
}

backfill().catch(console.error);
