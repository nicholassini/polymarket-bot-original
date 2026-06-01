// close_all_positions.js
// Marks all 'open' positions in .runtime/trades.db as 'closed'.
// Final DB reconciliation before retiring the leaked-key EOA. The bot is
// stopped, the DB is being abandoned, and strategy diagnosis is a separate
// future track that would re-derive P&L from the trades log if needed —
// so realized_pnl is intentionally NOT computed here. Just status updates.
//
// Run:
//   node close_all_positions.js                # preview (no writes)
//   $env:CONFIRM=1; node close_all_positions.js     # actually update

const Database = require('better-sqlite3');

const DB_PATH = '.runtime/trades.db';

function main() {
  console.log('=== Close all open positions ===\n');

  const db = new Database(DB_PATH);

  const open = db.prepare(`
    SELECT id, market_id, outcome, size, total_cost
    FROM positions WHERE status='open'
    ORDER BY id
  `).all();

  console.log(`Open positions: ${open.length}`);
  for (const r of open) {
    const mkt = String(r.market_id).length > 20
      ? String(r.market_id).slice(0, 20) + '…'
      : String(r.market_id);
    console.log(`  id=${String(r.id).padStart(2)}  ${r.outcome.padEnd(12)}  size=${r.size}  cost=$${r.total_cost.toFixed(2)}  ${mkt}`);
  }
  console.log();

  if (open.length === 0) {
    console.log('Nothing to do.');
    db.close();
    return;
  }

  if (process.env.CONFIRM !== '1') {
    console.log('CONFIRM != 1 — preview only. Re-run to commit:');
    console.log('  PowerShell:  $env:CONFIRM=1; node close_all_positions.js');
    console.log('  bash/zsh:    CONFIRM=1 node close_all_positions.js');
    db.close();
    return;
  }

  // ISO format to match the rest of positions.opened_at / updated_at
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE positions
    SET status='closed', closed_at=?, updated_at=?
    WHERE status='open'
  `).run(now, now);

  console.log(`Rows updated: ${result.changes}`);

  const stillOpen = db.prepare("SELECT COUNT(*) AS c FROM positions WHERE status='open'").get().c;
  const closedCount = db.prepare("SELECT COUNT(*) AS c FROM positions WHERE status='closed'").get().c;
  console.log(`After: open=${stillOpen}, closed=${closedCount}`);

  db.close();
  console.log('\nDone.');
}

try { main(); }
catch (err) { console.error('FATAL:', err); process.exit(1); }
