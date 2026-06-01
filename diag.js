const Database = require("better-sqlite3");
const db = new Database(".runtime/trades.db");

console.log("=== TOP 6 POSITIONS (by cost) ===");
const top = db.prepare("SELECT outcome, market_id, token_id, total_cost FROM positions WHERE status = 'open' ORDER BY total_cost DESC LIMIT 6").all();
for (const p of top) {
  console.log("outcome:", p.outcome, "| market_id:", p.market_id ? p.market_id.slice(0,20) + "..." : "NULL", "| token_id:", p.token_id ? p.token_id.slice(0,30) + "..." : "NULL/EMPTY", "| cost:", p.total_cost);
}

console.log("\n=== RECENT 10 TRADES ===");
const trades = db.prepare("SELECT order_id, market_id, token_id, side, outcome, price, size FROM trades ORDER BY timestamp DESC LIMIT 10").all();
for (const t of trades) {
  console.log("order:", t.order_id ? t.order_id.slice(0,12) : "NULL", "| market:", t.market_id ? t.market_id.slice(0,20) : "NULL", "| token:", t.token_id ? t.token_id.slice(0,30) + "..." : "NULL", "| side:", t.side, "| outcome:", t.outcome);
}

console.log("\n=== ALL OPEN POSITIONS ===");
const all = db.prepare("SELECT outcome, market_id, token_id, total_cost, size FROM positions WHERE status = 'open' ORDER BY total_cost DESC").all();
console.log("Total:", all.length);
for (const p of all) {
  console.log("outcome:", p.outcome, "| cost:", p.total_cost, "| size:", p.size, "| token:", p.token_id ? p.token_id.slice(0,40) + "..." : "NULL");
}
