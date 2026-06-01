// inspect_db.js — read-only DB inspection, probes both possible paths.
const fs = require('fs');
const Database = require('better-sqlite3');

const candidates = [
  '.runtime/trades.db',
  'data/trading.db',
  'data/orders.db',
];

console.log('=== DB file presence ===');
for (const p of candidates) {
  if (fs.existsSync(p)) {
    const stat = fs.statSync(p);
    console.log(`  ${p}: ${stat.size} bytes, mtime ${stat.mtime.toISOString()}`);
  } else {
    console.log(`  ${p}: MISSING`);
  }
}

function inspect(dbPath) {
  if (!fs.existsSync(dbPath)) return;
  console.log('\n\n###############################################');
  console.log(`# DB: ${dbPath}`);
  console.log('###############################################');

  const db = new Database(dbPath, { readonly: true });

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);
  console.log('\nTables:', tables.join(', ') || '(none)');

  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    const count = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    console.log(`  ${t}: ${count} rows  | cols: ${cols.join(', ')}`);
  }

  if (tables.includes('positions')) {
    console.log('\n--- positions schema ---');
    const sch = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='positions'"
    ).get();
    console.log(sch?.sql || '(missing)');

    console.log('\n--- positions id IN (2,3,5) ---');
    const rows = db.prepare("SELECT * FROM positions WHERE id IN (2,3,5)").all();
    console.log(JSON.stringify(rows, null, 2));

    console.log('\n--- all open positions ---');
    const open = db.prepare(
      "SELECT * FROM positions WHERE status='open' ORDER BY id"
    ).all();
    console.log(JSON.stringify(open, null, 2));
  }

  if (tables.includes('trades')) {
    console.log('\n--- trades schema ---');
    const sch = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='trades'"
    ).get();
    console.log(sch?.sql || '(missing)');

    console.log('\n--- trades sample (most recent 3) ---');
    const sample = db.prepare(
      "SELECT * FROM trades ORDER BY rowid DESC LIMIT 3"
    ).all();
    console.log(JSON.stringify(sample, null, 2));
  }

  db.close();
}

for (const p of candidates) inspect(p);