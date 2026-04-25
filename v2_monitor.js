// v2_monitor.js — Paper trading performance monitor for V2 build
// Usage: node v2_monitor.js

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'trading.db'), { readonly: true });

const now = Date.now();
const ONE_HOUR = 3600000;

console.log('=== POLYMARKET V2 PAPER TRADING MONITOR ===');
console.log('Timestamp:', new Date().toISOString());
console.log('');

// 1. Overall summary
const total = db.prepare('SELECT COUNT(*) as count FROM trades').get();
const firstTrade = db.prepare('SELECT MIN(timestamp) as ts FROM trades').get();
const lastTrade = db.prepare('SELECT MAX(timestamp) as ts FROM trades').get();
const runtime = firstTrade.ts ? ((lastTrade.ts - firstTrade.ts) / ONE_HOUR).toFixed(1) : 0;

console.log('--- OVERALL ---');
console.log('Total trades:    ', total.count);
console.log('First trade:     ', firstTrade.ts ? new Date(firstTrade.ts).toISOString() : 'none');
console.log('Last trade:      ', lastTrade.ts ? new Date(lastTrade.ts).toISOString() : 'none');
console.log('Runtime (hours): ', runtime);
console.log('Trades/hour:     ', runtime > 0 ? (total.count / runtime).toFixed(1) : 0);
console.log('');

// 2. Per-wallet breakdown
console.log('--- PER WALLET ---');
const wallets = db.prepare(`
  SELECT 
    wallet_id,
    COUNT(*) as trades,
    SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN realized_pnl <= 0 THEN 1 ELSE 0 END) as losses,
    ROUND(SUM(realized_pnl), 4) as net_pnl,
    ROUND(SUM(fee_amount), 4) as total_fees,
    ROUND(AVG(fee_rate), 4) as avg_fee_rate,
    ROUND(SUM(realized_pnl) + SUM(fee_amount), 4) as gross_pnl,
    ROUND(MIN(cumulative_pnl), 4) as max_drawdown,
    ROUND(MAX(cumulative_pnl), 4) as peak_pnl
  FROM trades
  GROUP BY wallet_id
  ORDER BY net_pnl DESC
`).all();

for (const w of wallets) {
  const winRate = w.trades > 0 ? ((w.wins / w.trades) * 100).toFixed(1) : 0;
  console.log(`  ${w.wallet_id}:`);
  console.log(`    Trades: ${w.trades}  |  Win rate: ${winRate}%  (${w.wins}W / ${w.losses}L)`);
  console.log(`    Net PnL: $${w.net_pnl}  |  Fees: $${w.total_fees}  |  Gross PnL: $${w.gross_pnl}`);
  console.log(`    Peak PnL: $${w.peak_pnl}  |  Max drawdown: $${w.max_drawdown}`);
  console.log(`    Avg fee rate: ${w.avg_fee_rate}`);
  console.log('');
}

// 3. Fee accounting health check
console.log('--- FEE ACCOUNTING ---');
const zeroFees = db.prepare(`
  SELECT COUNT(*) as count FROM trades WHERE fee_amount = 0 AND cost > 0
`).get();
const nonZeroFees = db.prepare(`
  SELECT COUNT(*) as count FROM trades WHERE fee_amount > 0
`).get();
const zeroCost = db.prepare(`
  SELECT COUNT(*) as count FROM trades WHERE cost = 0
`).get();

console.log('Trades with fees:      ', nonZeroFees.count);
console.log('Trades fee=0, cost>0:  ', zeroFees.count, zeroFees.count > 0 ? '(investigate!)' : '(ok)');
console.log('Zero-cost trades:      ', zeroCost.count, zeroCost.count > 0 ? '(sub-penny, expected)' : '(ok)');
console.log('');

// 4. Last hour activity
console.log('--- LAST HOUR ---');
const lastHour = db.prepare(`
  SELECT 
    wallet_id,
    COUNT(*) as trades,
    ROUND(SUM(realized_pnl), 4) as pnl
  FROM trades
  WHERE timestamp > ?
  GROUP BY wallet_id
`).all(now - ONE_HOUR);

if (lastHour.length === 0) {
  console.log('  No trades in the last hour — bot may be stopped or idle');
} else {
  for (const w of lastHour) {
    console.log(`  ${w.wallet_id}: ${w.trades} trades, PnL: $${w.pnl}`);
  }
}
console.log('');

// 5. Daily PnL trend
console.log('--- DAILY PNL ---');
const daily = db.prepare(`
  SELECT
    DATE(timestamp / 1000, 'unixepoch') as day,
    COUNT(*) as trades,
    ROUND(SUM(realized_pnl), 4) as pnl,
    ROUND(SUM(fee_amount), 4) as fees
  FROM trades
  GROUP BY day
  ORDER BY day
`).all();

for (const d of daily) {
  console.log(`  ${d.day}: ${d.trades} trades | PnL: $${d.pnl} | Fees: $${d.fees}`);
}
console.log('');

// 6. Last 10 trades
console.log('--- LAST 10 TRADES ---');
const recent = db.prepare(`
  SELECT 
    wallet_id,
    market_id,
    side,
    outcome,
    ROUND(price, 4) as price,
    ROUND(size, 4) as size,
    ROUND(cost, 4) as cost,
    ROUND(fee_amount, 6) as fee,
    ROUND(realized_pnl, 4) as pnl,
    ROUND(balance_after, 2) as bal,
    timestamp
  FROM trades
  ORDER BY timestamp DESC
  LIMIT 10
`).all();

for (const t of recent) {
  const time = new Date(t.timestamp).toLocaleTimeString();
  const mkt = t.market_id ? t.market_id.substring(0, 12) + '...' : 'unknown';
  console.log(`  ${time} | ${t.wallet_id} | ${t.side} ${t.outcome} | p=${t.price} s=${t.size} | fee=$${t.fee} | pnl=$${t.pnl} | bal=$${t.bal} | ${mkt}`);
}
console.log('');

// 7. Top/bottom markets
console.log('--- TOP 5 MARKETS BY PNL ---');
const topMarkets = db.prepare(`
  SELECT 
    market_id,
    COUNT(*) as trades,
    ROUND(SUM(realized_pnl), 4) as net_pnl
  FROM trades
  GROUP BY market_id
  ORDER BY net_pnl DESC
  LIMIT 5
`).all();

for (const m of topMarkets) {
  const mkt = m.market_id ? m.market_id.substring(0, 20) + '...' : 'unknown';
  console.log(`  ${mkt}  trades: ${m.trades}  pnl: $${m.net_pnl}`);
}

console.log('');
console.log('--- BOTTOM 5 MARKETS BY PNL ---');
const bottomMarkets = db.prepare(`
  SELECT 
    market_id,
    COUNT(*) as trades,
    ROUND(SUM(realized_pnl), 4) as net_pnl
  FROM trades
  GROUP BY market_id
  ORDER BY net_pnl ASC
  LIMIT 5
`).all();

for (const m of bottomMarkets) {
  const mkt = m.market_id ? m.market_id.substring(0, 20) + '...' : 'unknown';
  console.log(`  ${mkt}  trades: ${m.trades}  pnl: $${m.net_pnl}`);
}

console.log('');
console.log('=== END MONITOR ===');
db.close();