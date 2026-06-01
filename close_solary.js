const Database = require("better-sqlite3");
const db = new Database(".runtime/trades.db");
const now = new Date().toISOString();

// Solary: cost was $0.90, redeemed for $5.00 USDC.e = $4.10 profit
const pnl = 5.00 - 0.90;
db.prepare(
  "UPDATE positions SET status='closed', closed_at=?, realized_pnl=?, updated_at=? WHERE outcome='Solary' AND status='open'"
).run(now, pnl, now);

const open = db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='open'").get();
const closed = db.prepare("SELECT COUNT(*) as c FROM positions WHERE status='closed'").get();
console.log("Solary closed with PnL: +$" + pnl.toFixed(2));
console.log("Open positions:", open.c);
console.log("Closed positions:", closed.c);
