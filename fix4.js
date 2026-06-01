const fs = require("fs");
let types = fs.readFileSync("src/types.ts", "utf8");
// Use regex to handle any line ending style
types = types.replace(
  /export interface OrderFill \{\s+orderId: string;\s+marketId: string;\s+outcome:/,
  "export interface OrderFill {\r\n  orderId: string;\r\n  marketId: string;\r\n  tokenId?: string;\r\n  outcome:"
);
fs.writeFileSync("src/types.ts", types);
const check = types.match(/export interface OrderFill[\s\S]*?\}/);
console.log(check[0]);
