// wallet_health.js — Wallet activity diagnostic & stuck detection
// Usage: node wallet_health.js [wallet_id]
// Example: node wallet_health.js user_db
// No argument = checks all wallets

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'trading.db'), { readonly: true });
const targetWallet = process.argv[2] || null;

const now = Date.now();
const ONE_HOUR = 3600000;
const ONE_MIN = 60000;

console.log('=== WALLET HEALTH DIAGNOSTIC ===');
console.log('Timestamp:', new Date().toISOString());
if (targetWallet) console.log('Target wallet:', targetWallet);
console.log('');

// Get wallets to check
const walletFilter = targetWallet ? `WHERE wallet_id = '${targetWallet}'` : '';
const walletIds = db.prepare(`SELECT DISTINCT wallet_id FROM trades ${walletFilter}`).all();

if (walletIds.length === 0) {
  console.log('No trades found' + (targetWallet ? ` for wallet "${targetWallet}"` : '') + '.');
  process.exit(0);
}

for (const { wallet_id } of walletIds) {
  console.log(`========== ${wallet_id} ==========`);
  console.log('');

  // 1. Last activity
  const lastTrade = db.prepare(`
    SELECT *, ROUND(realized_pnl, 4) as pnl FROM trades 
    WHERE wallet_id = ? ORDER BY timestamp DESC LIMIT 1
  `).get(wallet_id);

  const minutesAgo = ((now - lastTrade.timestamp) / ONE_MIN).toFixed(1);
  const hoursAgo = ((now - lastTrade.timestamp) / ONE_HOUR).toFixed(1);

  let status = 'ACTIVE';
  if (minutesAgo > 120) status = 'STALE (>2 hours)';
  if (minutesAgo > 360) status = 'STUCK (>6 hours)';

  console.log('--- ACTIVITY STATUS ---');
  console.log(`  Status:          ${status}`);
  console.log(`  Last trade:      ${new Date(lastTrade.timestamp).toISOString()} (${minutesAgo} min ago)`);
  console.log(`  Last side:       ${lastTrade.side} ${lastTrade.outcome}`);
  console.log(`  Last price:      ${lastTrade.price}`);
  console.log(`  Last PnL:        $${lastTrade.pnl}`);
  console.log('');

  // 2. Hourly trade frequency (last 12 hours)
  console.log('--- HOURLY TRADE FREQUENCY (last 12h) ---');
  const hourly = db.prepare(`
    SELECT 
      CAST((? - timestamp) / ? AS INTEGER) as hours_ago,
      COUNT(*) as trades,
      ROUND(SUM(realized_pnl), 4) as pnl
    FROM trades
    WHERE wallet_id = ? AND timestamp > ?
    GROUP BY hours_ago
    ORDER BY hours_ago ASC
  `).all(now, ONE_HOUR, wallet_id, now - (12 * ONE_HOUR));

  const hourMap = {};
  for (const h of hourly) hourMap[h.hours_ago] = h;

  for (let i = 0; i < 12; i++) {
    const h = hourMap[i];
    const label = i === 0 ? 'now' : `${i}h ago`;
    if (h) {
      const bar = '#'.repeat(Math.min(Math.ceil(h.trades / 10), 40));
      console.log(`  ${label.padStart(6)}: ${String(h.trades).padStart(5)} trades | pnl: $${String(h.pnl).padStart(8)} | ${bar}`);
    } else {
      console.log(`  ${label.padStart(6)}:     0 trades |                   | (silent)`);
    }
  }
  console.log('');

  // 3. Capital deployment — is the wallet out of free cash?
  console.log('--- CAPITAL ANALYSIS ---');
  const latestBalance = db.prepare(`
    SELECT balance_after FROM trades WHERE wallet_id = ? ORDER BY timestamp DESC LIMIT 1
  `).get(wallet_id);

  const totalBought = db.prepare(`
    SELECT ROUND(SUM(cost), 4) as total FROM trades 
    WHERE wallet_id = ? AND side = 'BUY'
  `).get(wallet_id);

  const totalSold = db.prepare(`
    SELECT ROUND(SUM(cost), 4) as total FROM trades 
    WHERE wallet_id = ? AND side = 'SELL'
  `).get(wallet_id);

  console.log(`  Current balance: $${latestBalance ? latestBalance.balance_after.toFixed(2) : 'unknown'}`);
  console.log(`  Total bought:    $${totalBought.total || 0}`);
  console.log(`  Total sold:      $${totalSold.total || 0}`);
  console.log('');

  // 4. Open position estimate — how many unique markets with net buys
  const openPositions = db.prepare(`
    SELECT COUNT(DISTINCT market_id) as count FROM (
      SELECT market_id, 
        SUM(CASE WHEN side = 'BUY' THEN size ELSE -size END) as net_size
      FROM trades
      WHERE wallet_id = ?
      GROUP BY market_id
      HAVING net_size > 0.01
    )
  `).get(wallet_id);

  const totalMarkets = db.prepare(`
    SELECT COUNT(DISTINCT market_id) as count FROM trades WHERE wallet_id = ?
  `).get(wallet_id);

  console.log('--- POSITION ANALYSIS ---');
  console.log(`  Estimated open positions:  ${openPositions.count}`);
  console.log(`  Total markets traded:      ${totalMarkets.count}`);
  console.log('');

  // 5. Exposure concentration — top markets by open size
  console.log('--- TOP 5 OPEN POSITIONS (by net size) ---');
  const topPositions = db.prepare(`
    SELECT market_id,
      ROUND(SUM(CASE WHEN side = 'BUY' THEN size ELSE -size END), 4) as net_size,
      ROUND(SUM(CASE WHEN side = 'BUY' THEN cost ELSE -cost END), 4) as net_cost,
      COUNT(*) as trades
    FROM trades
    WHERE wallet_id = ?
    GROUP BY market_id
    HAVING net_size > 0.01
    ORDER BY net_cost DESC
    LIMIT 5
  `).all(wallet_id);

  for (const p of topPositions) {
    const mkt = p.market_id.substring(0, 16) + '...';
    console.log(`  ${mkt}  size: ${p.net_size}  cost: $${p.net_cost}  trades: ${p.trades}`);
  }
  console.log('');

  // 6. Recent trade distribution — buy vs sell ratio
  console.log('--- BUY/SELL RATIO (last 3h vs last 24h) ---');
  const ratio3h = db.prepare(`
    SELECT 
      SUM(CASE WHEN side = 'BUY' THEN 1 ELSE 0 END) as buys,
      SUM(CASE WHEN side = 'SELL' THEN 1 ELSE 0 END) as sells
    FROM trades
    WHERE wallet_id = ? AND timestamp > ?
  `).get(wallet_id, now - (3 * ONE_HOUR));

  const ratio24h = db.prepare(`
    SELECT 
      SUM(CASE WHEN side = 'BUY' THEN 1 ELSE 0 END) as buys,
      SUM(CASE WHEN side = 'SELL' THEN 1 ELSE 0 END) as sells
    FROM trades
    WHERE wallet_id = ? AND timestamp > ?
  `).get(wallet_id, now - (24 * ONE_HOUR));

  console.log(`  Last 3h:  ${ratio3h.buys || 0} buys / ${ratio3h.sells || 0} sells`);
  console.log(`  Last 24h: ${ratio24h.buys || 0} buys / ${ratio24h.sells || 0} sells`);

  if (ratio3h.buys === 0 && ratio3h.sells > 0) {
    console.log('  ⚠ Only selling, no buying — wallet may be capital-constrained');
  }
  if ((ratio3h.buys || 0) === 0 && (ratio3h.sells || 0) === 0) {
    console.log('  ⚠ No activity at all in last 3 hours');
  }
  console.log('');

  // 7. Declining activity detection
  console.log('--- ACTIVITY TREND (last 6 hours) ---');
  const h6 = [];
  for (let i = 0; i < 6; i++) {
    const count = db.prepare(`
      SELECT COUNT(*) as c FROM trades
      WHERE wallet_id = ? AND timestamp > ? AND timestamp <= ?
    `).get(wallet_id, now - ((i + 1) * ONE_HOUR), now - (i * ONE_HOUR));
    h6.push(count.c);
  }

  const recentAvg = (h6[0] + h6[1] + h6[2]) / 3;
  const olderAvg = (h6[3] + h6[4] + h6[5]) / 3;
  const trend = olderAvg > 0 ? ((recentAvg / olderAvg) * 100).toFixed(0) : 'N/A';

  console.log(`  Recent 3h avg:   ${recentAvg.toFixed(0)} trades/hour`);
  console.log(`  Prior 3h avg:    ${olderAvg.toFixed(0)} trades/hour`);
  console.log(`  Trend:           ${trend}% of prior rate`);

  if (recentAvg === 0 && olderAvg > 0) {
    console.log('  🔴 ALERT: Activity dropped to zero — investigate immediately');
  } else if (trend !== 'N/A' && trend < 30) {
    console.log('  🟡 WARNING: Activity declining sharply');
  } else if (trend !== 'N/A' && trend < 60) {
    console.log('  🟡 NOTE: Activity moderately declining');
  }
  console.log('');
}

console.log('=== DIAGNOSTIC CHECKLIST ===');
console.log('If a wallet shows STALE or STUCK:');
console.log('  1. Check if bot process is still running (dashboard at :3000 or check terminal)');
console.log('  2. Check balance_after — if near $0, wallet is capital-exhausted');
console.log('  3. Check open positions vs max_open_trades in config.yaml');
console.log('  4. Check buy/sell ratio — only sells means no free capital for new buys');
console.log('  5. Check bot logs for errors: strategy errors, API failures, scheduler issues');
console.log('  6. Check dashboard at http://localhost:3000 for kill switch status');
console.log('  7. If truly stuck, restart: npm run build && npm start');
console.log('');
console.log('=== END DIAGNOSTIC ===');
db.close();
