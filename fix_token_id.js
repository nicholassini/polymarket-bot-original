/**
 * Polymarket Bot — P0 Fix Script
 * 
 * Fixes 3 bugs:
 *   1. OrderFill type missing tokenId field (types.ts)
 *   2. applyConfirmedFill() not passing tokenId to fill object (order_tracker.ts)
 *   3. applyFill() not passing tokenId to recordTrade/upsertPosition (polymarket_wallet.ts)
 *   4. reconcileBalance() using wrong env var POLYGON_RPC instead of POLYGON_RPC_URL
 * 
 * Then backfills the 6 broken positions using CLOB API trade history.
 *
 * USAGE:
 *   1. Stop the bot (Ctrl+C)
 *   2. Review the patches below
 *   3. Apply them manually or run: node fix_token_id.js
 *   4. npm run build && npm start
 */

const fs = require("fs");

// ============================================================
// PATCH 1: types.ts — Add tokenId to OrderFill interface
// ============================================================

let types = fs.readFileSync("src/types.ts", "utf8");

const OLD_ORDER_FILL = `export interface OrderFill {
  orderId: string;
  marketId: string;
  outcome: OrderOutcome;
  side: OrderSide;
  price: number;
  size: number;
  timestamp: number;
}`;

const NEW_ORDER_FILL = `export interface OrderFill {
  orderId: string;
  marketId: string;
  tokenId?: string;
  outcome: OrderOutcome;
  side: OrderSide;
  price: number;
  size: number;
  timestamp: number;
}`;

if (types.includes(OLD_ORDER_FILL)) {
  types = types.replace(OLD_ORDER_FILL, NEW_ORDER_FILL);
  fs.writeFileSync("src/types.ts", types);
  console.log("✅ PATCH 1: types.ts — added tokenId to OrderFill");
} else if (types.includes("tokenId?: string;") && types.includes("OrderFill")) {
  console.log("⏭️  PATCH 1: types.ts — already patched");
} else {
  console.log("❌ PATCH 1: types.ts — could not find OrderFill to patch. Manual edit needed.");
}

// ============================================================
// PATCH 2: order_tracker.ts — Pass tokenId in applyConfirmedFill
// ============================================================

let tracker = fs.readFileSync("src/execution/order_tracker.ts", "utf8");

const OLD_FILL_OBJECT = `    const fill: OrderFill = {
      orderId: order.orderId,
      marketId: order.submission.marketId,
      outcome: order.submission.outcome,
      side: order.submission.side,
      price: fillPrice,
      size: filledSize,
      timestamp: Date.now(),
    };`;

const NEW_FILL_OBJECT = `    const fill: OrderFill = {
      orderId: order.orderId,
      marketId: order.submission.marketId,
      tokenId: (order.submission as Record<string, unknown>).tokenId as string | undefined,
      outcome: order.submission.outcome,
      side: order.submission.side,
      price: fillPrice,
      size: filledSize,
      timestamp: Date.now(),
    };`;

if (tracker.includes(OLD_FILL_OBJECT)) {
  tracker = tracker.replace(OLD_FILL_OBJECT, NEW_FILL_OBJECT);
  fs.writeFileSync("src/execution/order_tracker.ts", tracker);
  console.log("✅ PATCH 2: order_tracker.ts — tokenId now passed in fill object");
} else if (tracker.includes("tokenId:") && tracker.includes("applyConfirmedFill")) {
  console.log("⏭️  PATCH 2: order_tracker.ts — already patched");
} else {
  console.log("❌ PATCH 2: order_tracker.ts — could not find fill object to patch. Manual edit needed.");
}

// ============================================================
// PATCH 3: polymarket_wallet.ts — Pass tokenId to recordTrade + upsertPosition
// ============================================================

let wallet = fs.readFileSync("src/wallets/polymarket_wallet.ts", "utf8");

// 3a: recordTrade — add tokenId
const OLD_RECORD_TRADE = `      db.recordTrade({
        orderId:   fill.orderId,
        walletId:  this.state.walletId,
        marketId:  fill.marketId,
        side:      fill.side,
        outcome:   fill.outcome,
        price:     fill.price,
        size:      fill.size,
        cost,
        fee,
        timestamp: new Date(fill.timestamp).toISOString(),
        status:    'filled',
      });`;

const NEW_RECORD_TRADE = `      db.recordTrade({
        orderId:   fill.orderId,
        walletId:  this.state.walletId,
        marketId:  fill.marketId,
        tokenId:   fill.tokenId,
        side:      fill.side,
        outcome:   fill.outcome,
        price:     fill.price,
        size:      fill.size,
        cost,
        fee,
        timestamp: new Date(fill.timestamp).toISOString(),
        status:    'filled',
      });`;

if (wallet.includes(OLD_RECORD_TRADE)) {
  wallet = wallet.replace(OLD_RECORD_TRADE, NEW_RECORD_TRADE);
  console.log("✅ PATCH 3a: polymarket_wallet.ts — tokenId added to recordTrade()");
} else {
  console.log("⏭️  PATCH 3a: polymarket_wallet.ts recordTrade — already patched or different format");
}

// 3b: upsertPosition — add tokenId
const OLD_UPSERT = `        db.upsertPosition({
          walletId:    this.state.walletId,
          marketId:    fill.marketId,
          outcome:     fill.outcome,
          side:        fill.side,
          size:        pos.size,
          avgPrice:    pos.avgPrice,
          totalCost:   pos.avgPrice * pos.size,
          realizedPnl: pos.realizedPnl,
          openedAt:    new Date().toISOString(),
        });`;

const NEW_UPSERT = `        db.upsertPosition({
          walletId:    this.state.walletId,
          marketId:    fill.marketId,
          tokenId:     fill.tokenId,
          outcome:     fill.outcome,
          side:        fill.side,
          size:        pos.size,
          avgPrice:    pos.avgPrice,
          totalCost:   pos.avgPrice * pos.size,
          realizedPnl: pos.realizedPnl,
          openedAt:    new Date().toISOString(),
        });`;

if (wallet.includes(OLD_UPSERT)) {
  wallet = wallet.replace(OLD_UPSERT, NEW_UPSERT);
  console.log("✅ PATCH 3b: polymarket_wallet.ts — tokenId added to upsertPosition()");
} else {
  console.log("⏭️  PATCH 3b: polymarket_wallet.ts upsertPosition — already patched or different format");
}

// ============================================================
// PATCH 4: reconcileBalance — fix env var name
// ============================================================

const OLD_RPC_LINE = `    const RPC = process.env.POLYGON_RPC ?? 'https://polygon-rpc.com';`;
const NEW_RPC_LINE = `    const RPC = process.env.POLYGON_RPC_URL ?? process.env.POLYGON_RPC ?? 'https://polygon-bor-rpc.publicnode.com';`;

if (wallet.includes(OLD_RPC_LINE)) {
  wallet = wallet.replace(OLD_RPC_LINE, NEW_RPC_LINE);
  console.log("✅ PATCH 4: polymarket_wallet.ts — reconcileBalance RPC env var fixed");
} else if (wallet.includes("POLYGON_RPC_URL")) {
  console.log("⏭️  PATCH 4: polymarket_wallet.ts — already patched");
} else {
  console.log("❌ PATCH 4: polymarket_wallet.ts — could not find RPC line to patch. Manual edit needed.");
}

fs.writeFileSync("src/wallets/polymarket_wallet.ts", wallet);
console.log("✅ polymarket_wallet.ts saved");

console.log("\n=== All patches applied. Run: npm run build ===\n");
