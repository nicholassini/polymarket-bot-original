const Database = require('better-sqlite3');
const db = new Database('./data/trading.db');

const fifteenMinAgo = Date.now() - 15*60*1000;

console.log('=== FEE STATS (last 15 min) ===');
const stats = db.prepare(
  'SELECT COUNT(*) as total, COUNT(CASE WHEN fee_amount > 0 THEN 1 END) as with_fees, COUNT(CASE WHEN fee_amount = 0 THEN 1 END) as without_fees, ROUND(AVG(CASE WHEN fee_amount > 0 THEN fee_rate END), 4) as avg_rate, ROUND(SUM(fee_amount), 4) as total_fees FROM trades WHERE timestamp > ' + fifteenMinAgo
).get();
console.table([stats]);

console.log('\n=== PER-WALLET FEE COVERAGE (last 15 min) ===');
const perWallet = db.prepare(
  'SELECT wallet_id, COUNT(*) as trades, COUNT(CASE WHEN fee_amount > 0 THEN 1 END) as with_fees, ROUND(100.0 * COUNT(CASE WHEN fee_amount > 0 THEN 1 END) / COUNT(*), 1) as pct FROM trades WHERE timestamp > ' + fifteenMinAgo + ' GROUP BY wallet_id ORDER BY trades DESC'
).all();
console.table(perWallet);

db.close();
