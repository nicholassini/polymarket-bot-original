// schema_check.js
const Database = require('better-sqlite3');
const db = new Database('./data/trading.db', { readonly: true });
const cols = db.prepare("PRAGMA table_info(trades)").all();
console.table(cols);
db.close();