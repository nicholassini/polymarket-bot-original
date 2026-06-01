const fs = require("fs");

// Show applyFill and related methods in polymarket_wallet.ts
const wallet = fs.readFileSync("src/wallets/polymarket_wallet.ts", "utf8");
const lines = wallet.split("\n");

// Find applyFill method
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("applyFill") || lines[i].includes("recordTrade") || lines[i].includes("upsertPosition")) {
    const start = Math.max(0, i - 2);
    const end = Math.min(lines.length, i + 40);
    console.log(`\n=== Line ${start+1}-${end+1} ===`);
    for (let j = start; j < end; j++) {
      console.log(`${j+1}: ${lines[j]}`);
    }
  }
}

// Also show OrderTracker fill detection
const tracker = fs.readFileSync("src/execution/order_tracker.ts", "utf8");
const tlines = tracker.split("\n");
for (let i = 0; i < tlines.length; i++) {
  if (tlines[i].includes("applyFill") || tlines[i].includes("MATCHED") || tlines[i].includes("filled")) {
    const start = Math.max(0, i - 3);
    const end = Math.min(tlines.length, i + 15);
    console.log(`\n=== order_tracker.ts Line ${start+1}-${end+1} ===`);
    for (let j = start; j < end; j++) {
      console.log(`${j+1}: ${tlines[j]}`);
    }
  }
}
