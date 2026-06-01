const fs = require("fs");
let types = fs.readFileSync("src/types.ts", "utf8");
types = types.replace(
  "export interface OrderFill {\n  orderId: string;\n  marketId: string;\n  outcome:",
  "export interface OrderFill {\n  orderId: string;\n  marketId: string;\n  tokenId?: string;\n  outcome:"
);
fs.writeFileSync("src/types.ts", types);
// Verify
const check = types.match(/export interface OrderFill[\s\S]*?\}/);
console.log(check[0]);
