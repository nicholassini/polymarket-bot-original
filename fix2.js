const fs = require("fs");

// Fix 1: Add tokenId to OrderFill in types.ts
let types = fs.readFileSync("src/types.ts", "utf8");
// Check if OrderFill already has tokenId
const fillMatch = types.match(/export interface OrderFill \{[^}]+\}/s);
if (fillMatch && !fillMatch[0].includes("tokenId")) {
  types = types.replace(
    "  marketId: string;\n  outcome: OrderOutcome;",
    "  marketId: string;\n  tokenId?: string;\n  outcome: OrderOutcome;"
  );
  fs.writeFileSync("src/types.ts", types);
  console.log("OK PATCH 1: tokenId added to OrderFill");
} else if (fillMatch && fillMatch[0].includes("tokenId")) {
  console.log("SKIP PATCH 1: OrderFill already has tokenId");
} else {
  console.log("FAIL PATCH 1: could not find OrderFill");
}

// Fix 2: Fix the cast in order_tracker.ts
let tracker = fs.readFileSync("src/execution/order_tracker.ts", "utf8");
tracker = tracker.replace(
  "(order.submission as Record<string, unknown>).tokenId as string | undefined",
  "((order.submission as unknown) as Record<string, unknown>).tokenId as string | undefined"
);
fs.writeFileSync("src/execution/order_tracker.ts", tracker);
console.log("OK PATCH 2: fixed double cast in order_tracker.ts");

console.log("\nRun: npm run build");
