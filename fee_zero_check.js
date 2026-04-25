// fee_zero_check.js
const Database = require('better-sqlite3');
const db = new Database('./data/trading.db', { readonly: true });
const r = db.prepare(`
  SELECT ROUND(cost, 4) as cost, ROUND(fee_amount, 6) as fee, 
         ROUND(fee_rate, 4) as rate, COUNT(*) as count
  FROM trades WHERE fee_amount = 0 AND cost > 0
  GROUP BY ROUND(cost, 2)
  ORDER BY count DESC LIMIT 10
`).all();
console.table(r);
db.close();