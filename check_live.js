const Database = require('better-sqlite3');
const db = new Database('./data/trading.db');

// Check if trades table exists and has data
try {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM trades').get();
  console.log('Total trades:', count.cnt);

  const recent = db.prepare(
    'SELECT wallet_id, market_id, side, price, size, cost, fee_amount, timestamp FROM trades ORDER BY timestamp DESC LIMIT 10'
  ).all();
  
  if (recent.length > 0) {
    console.log('\nLast 10 trades:');
    console.table(recent);
  } else {
    console.log('No trades yet.');
  }
} catch (e) {
  console.log('Trades table not yet created or empty:', e.message);
}

// Check pending orders
try {
  const orders = db.prepare('SELECT * FROM orders LIMIT 10').all();
  console.log('\nPending orders:', orders.length);
  if (orders.length > 0) console.table(orders);
} catch (e) {
  console.log('No orders table:', e.message);
}

db.close();