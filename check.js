const fs = require("fs");
const types = fs.readFileSync("src/types.ts", "utf8");
const match = types.match(/export interface OrderFill[\s\S]*?\}/);
console.log("Current OrderFill:\n" + (match ? match[0] : "NOT FOUND"));
