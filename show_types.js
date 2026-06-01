const fs = require("fs");

// Show OrderFill type
const types = fs.readFileSync("src/types.ts", "utf8");
const tlines = types.split("\n");
for (let i = 0; i < tlines.length; i++) {
  if (tlines[i].includes("OrderFill")) {
    const start = Math.max(0, i - 1);
    const end = Math.min(tlines.length, i + 20);
    console.log("=== types.ts OrderFill ===");
    for (let j = start; j < end; j++) console.log((j+1) + ": " + tlines[j]);
    break;
  }
}

// Show trades_db schema (recordTrade and upsertPosition signatures + INSERT statements)
const db = fs.readFileSync("src/storage/trades_db.ts", "utf8");
const dlines = db.split("\n");
for (let i = 0; i < dlines.length; i++) {
  if (dlines[i].includes("CREATE TABLE") || dlines[i].includes("recordTrade") || dlines[i].includes("upsertPosition") || dlines[i].includes("INSERT")) {
    const start = Math.max(0, i - 1);
    const end = Math.min(dlines.length, i + 15);
    console.log("\n=== trades_db.ts Line " + (start+1) + "-" + (end+1) + " ===");
    for (let j = start; j < end; j++) console.log((j+1) + ": " + dlines[j]);
  }
}

// Show PendingOrder / submission type to confirm tokenId exists
const tracker = fs.readFileSync("src/execution/order_tracker.ts", "utf8");
const olines = tracker.split("\n");
for (let i = 0; i < olines.length; i++) {
  if (olines[i].includes("interface PendingOrder") || olines[i].includes("submission:")) {
    const start = Math.max(0, i - 1);
    const end = Math.min(olines.length, i + 15);
    console.log("\n=== order_tracker.ts PendingOrder ===");
    for (let j = start; j < end; j++) console.log((j+1) + ": " + olines[j]);
    break;
  }
}
