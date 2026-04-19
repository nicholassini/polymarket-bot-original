const db = require('better-sqlite3')('data/trading.db');
const r = db.prepare("SELECT wallet_id, side, price, size, fee_amount, fee_rate, (price*size) as cost FROM trades WHERE fee_amount=0 ORDER BY timestamp DESC LIMIT 10").all();
console.table(r);
