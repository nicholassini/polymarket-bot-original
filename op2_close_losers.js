require("dotenv").config();
const Database = require("better-sqlite3");

const db = new Database(".runtime/trades.db");

// Position db id=11: Hynek Barton, size=5, avg_price=0.20, total_cost=1.0
// Position db id=12: Shifters, size=10, avg_price=0.13, total_cost=1.3
// Both: outcome=1, payoutNumerators[1]=0 → worthless tokens
// realized_pnl = 0 - total_cost (full loss)

const now = new Date().toISOString();

function closeLoser(id, total_cost) {
  const before = db.prepare("SELECT * FROM positions WHERE id = ?").get(id);
  console.log("BEFORE id=" + id + ":", JSON.stringify(before));

  const realized_pnl = -(total_cost);

  const stmt = db.prepare(`
    UPDATE positions
    SET status = 'closed',
        realized_pnl = ?,
        closed_at = ?,
        updated_at = ?
    WHERE id = ? AND status = 'open'
  `);
  const result = stmt.run(realized_pnl, now, now, id);
  console.log("SQL: UPDATE positions SET status='closed', realized_pnl=" + realized_pnl + ", closed_at='" + now + "', updated_at='" + now + "' WHERE id=" + id + " AND status='open'");
  console.log("Rows changed:", result.changes);
  if (result.changes !== 1) {
    console.error("  *** ERROR: expected 1 row changed, got " + result.changes);
    process.exit(1);
  }

  const after = db.prepare("SELECT * FROM positions WHERE id = ?").get(id);
  console.log("AFTER  id=" + id + ":", JSON.stringify(after));
  console.log();
}

console.log("=== Closing loser positions ===\n");

// id=11: Hynek Barton, total_cost=1.0
closeLoser(11, 1.0);

// id=12: Shifters, total_cost=1.3
closeLoser(12, 1.3);

// Verify final state
console.log("=== Verification ===");
const open = db.prepare("SELECT COUNT(*) as cnt FROM positions WHERE status='open'").get();
const totalCost = db.prepare("SELECT SUM(total_cost) as s FROM positions WHERE status='open'").get();
console.log("Open positions:", open.cnt);
console.log("Total deployed capital:", totalCost.s?.toFixed(4));

db.close();
