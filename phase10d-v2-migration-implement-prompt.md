# Phase 10d — Implement CLOB V2 Migration

## Context

Read `V2_MIGRATION_AUDIT.md` in the project root first. It maps every V1 touchpoint that needs to change.

**Deadline:** April 28, 2026 — Polymarket cuts over to V2 with zero backward compatibility.  
**Strategy:** Hybrid — SDK for write operations, raw fetch for read-only endpoints.  
**Constraint:** Paper trading must remain completely unaffected. All V2 changes are isolated to the live (PolymarketWallet) path.

---

## Step 1: Install Dependencies

```bash
npm install @polymarket/clob-client-v2 ethers@^5.8.0
```

After installing, check `node_modules/@polymarket/clob-client-v2` to understand:
- What the `ClobClient` constructor signature looks like
- What `createAndPostOrder()` accepts and returns
- What `getOrder()`, `cancelOrder()`, `getOpenOrders()` return
- What `Side`, `OrderType` enums are available
- Whether `createOrDeriveApiKey()` is a method on ClobClient

**Read the actual installed SDK source** — don't rely solely on the docs I provided. The API may have minor differences.

---

## Step 2: Add POLYMARKET_PRIVATE_KEY env var

**File: `.env.example`** (or `.env` if no example exists)

Add:
```
# V2: Private key for the bot's EOA wallet (0x-prefixed)
# Used to derive API credentials and sign EIP-712 orders
POLYMARKET_PRIVATE_KEY=

# V2: These are now auto-derived from PRIVATE_KEY at startup — do NOT set manually
# POLYMARKET_API_KEY (derived)
# POLYMARKET_API_SECRET (derived)  
# POLYMARKET_API_PASSPHRASE (derived)
```

**File: `src/core/config_validator.ts`**

Add validation: when live trading is enabled, `POLYMARKET_PRIVATE_KEY` must be set and must start with `0x`. The existing `POLYMARKET_API_KEY` validation should be removed or made optional (it's now derived, not manually set).

---

## Step 3: Create SDK Client Singleton

**File: `src/utils/clob_client.ts`**

This file currently exports `getClobHeaders()` which returns Bearer token headers. Refactor it to:

1. Export a `getClobClient()` async function that:
   - Creates an `ethers.Wallet` from `POLYMARKET_PRIVATE_KEY`
   - Creates a temporary `ClobClient` and calls `createOrDeriveApiKey()` to get credentials
   - Creates and returns a fully authenticated `ClobClient` with `signatureType: 0` (EOA)
   - Caches the client singleton — don't re-derive credentials on every call
   - Uses `POLYMARKET_CLOB_API` or `CLOB_API_URL` env var for the host, defaulting to `https://clob.polymarket.com`

2. Keep `getClobHeaders()` working for any remaining raw-fetch callers that need V2 L1/L2 headers, OR deprecate it if all callers move to the SDK.

3. Handle errors gracefully — if PRIVATE_KEY is missing (paper-only mode), `getClobClient()` should return null, not crash.

**Important:** Check what the actual SDK constructor looks like after installing. The V2 constructor uses an options object:
```typescript
new ClobClient({
  host: "https://clob.polymarket.com",
  chain: 137,
  signer: wallet,
  creds: { key, secret, passphrase },
  signatureType: 0,
  funderAddress: wallet.address,
})
```

---

## Step 4: Update OrderSubmission Type

**File: `src/types/order.ts`**

Add `tokenId: string` to `OrderSubmission` (the CLOB token ID for the specific outcome). This is different from `marketId` — the tokenId encodes both the market and the outcome (YES/NO).

Keep `marketId` and `outcome` for backward compatibility with paper wallets and internal tracking. The live wallet will use `tokenId` for the SDK call.

Also check where `OrderSubmission` is constructed — strategies may need to populate `tokenId`. Search for all sites that create `OrderSubmission` objects and verify they can supply a `tokenId`. If strategies currently only have `marketId`, you may need to look up the tokenId from market data — check `src/data/market_fetcher.ts` to see if token IDs are already available.

---

## Step 5: Replace Order Submission in PolymarketWallet

**File: `src/wallets/polymarket_wallet.ts`**

This is the biggest change. Replace the raw `fetch('/order')` block (around line 213) with the SDK.

### Current flow (V1):
```
1. Pre-flight checks
2. reserveBalance(cost)
3. fetch POST /order with Bearer token + {market, side, outcome, price, size, type}
4. Parse response
5. Track order
```

### New flow (V2):
```
1. Pre-flight checks (unchanged)
2. reserveBalance(cost) (unchanged)
3. Get ClobClient singleton via getClobClient()
4. Call client.createAndPostOrder(
     { tokenID: request.tokenId, price: request.price, size: request.size, side: Side.BUY/SELL },
     { tickSize: "0.01", negRisk: <from market data> },
     OrderType.GTC
   )
5. Parse SDK response (check actual response shape from the installed SDK)
6. Track order (unchanged)
```

### What to watch for:
- The SDK `Side` enum: make sure `request.side` maps correctly (your bot may use "BUY"/"SELL" strings vs SDK enum)
- The `tickSize` — may need to come from market data. Check if the SDK has a `getTickSize()` helper
- The `negRisk` flag — multi-outcome markets use it. Check market data for this field
- The SDK response shape — does it return `{ orderID, status }` or something else?
- Error handling — what does the SDK throw/return on rejection?

### Constructor changes:
The `PolymarketWallet` constructor needs access to the `ClobClient`. Options:
- **Option A (recommended):** Accept an optional `ClobClient` in the constructor or via a setter. Initialize it in `cli.ts` at startup and inject it.
- **Option B:** Call `getClobClient()` lazily on first order submission. Simpler but adds latency to the first trade.

---

## Step 6: Update Order Tracker

**File: `src/execution/order_tracker.ts`**

Replace the raw fetch calls for order status polling and cancellation:

### GET /order/{id} (status polling, ~line 134):
Replace with `client.getOrder(orderId)` from the SDK. Check the response format — the V2 response may use different field names for status and filled size. Map them back to whatever `OrderTracker` expects.

### DELETE /order/{id} (cancel, ~line 232):
Replace with `client.cancelOrder(orderId)` from the SDK.

### ClobClient access:
The OrderTracker needs access to the ClobClient singleton. It currently receives the API key as a constructor arg. Change this to receive either the ClobClient directly or a factory function. For paper-only mode (no live wallets), OrderTracker isn't started, so this is safe.

---

## Step 7: Update Balance Reconciliation (USDC.e → pUSD)

**File: `src/wallets/polymarket_wallet.ts`**

In `reconcileBalance()` (~line 326):

1. Change the USDC contract address from `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` to `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` (pUSD)
2. Change the decimal divisor from `1e6` to `1e18` (pUSD is 18 decimals, USDC.e was 6)

Make the address configurable via env var or config rather than hardcoding, so future token changes don't require code changes:
```typescript
const COLLATERAL_ADDRESS = process.env.POLYMARKET_COLLATERAL_ADDRESS || '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
const COLLATERAL_DECIMALS = parseInt(process.env.POLYMARKET_COLLATERAL_DECIMALS || '18');
```

---

## Step 8: Update Whale Scanner References

**File: `config.yaml`** (~line 222)
Change `usdcContractAddress` to `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`

**File: `src/whales/whale_types.ts`** (~line 743)
Change default `usdcContractAddress` to `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`

**File: `src/whales/whale_scanner.ts`**
Search for any `/ 1e6` or `/ 10**6` or `/ 1000000` division in balance-check code and update to `/ 1e18` for pUSD. The whale scanner may use the configurable address from `config.yaml`, so if it reads `usdcContractAddress` from config, only the config value needs updating. But verify the decimal handling.

---

## Step 9: Update Config Validator

**File: `src/core/config_validator.ts`**

Replace the startup credential check:
- Current: `GET /` with Bearer token, checks for 401/403
- New: Use the SDK client to call something lightweight like `client.getServerTime()` or simply verify that `createOrDeriveApiKey()` succeeds during client initialization (Step 3). If that works, credentials are valid.

---

## Step 10: Fee Model Awareness

**File: `src/wallets/polymarket_wallet.ts`** and **`config.yaml`**

V2 fees are dynamic per market: `fee = C × feeRate × p × (1 - p)`. The current static `taker_fee_rate: 0.02` in config.yaml won't be accurate for all markets.

**Minimum viable approach:** Keep the static rate as a conservative estimate. Document in config.yaml that V2 fees are dynamic and the static rate is an approximation. The paper wallet uses this same rate, so changing it would affect paper PnL accuracy.

**Better approach (if time permits):** When placing a live order, call `client.getClobMarketInfo(conditionID)` to get the actual fee rate for that market, and use it for the fee calculation in `applyFill()`. This requires the `conditionID` to be available on the order flow (it may already be in market data).

For now, implement the minimum viable approach and add a TODO for the better approach.

---

## Step 11: Wire It All Together in cli.ts

**File: `src/cli.ts`**

At startup, when live trading is enabled:
1. Call `getClobClient()` to create the SDK singleton
2. If it returns null (missing PRIVATE_KEY), abort with a clear error
3. Inject the ClobClient into `PolymarketWallet` instances
4. Inject the ClobClient (or its auth capabilities) into `OrderTracker`
5. The existing OrderTracker wiring from Phase 10c should continue to work — just update how it gets auth

---

## Testing Requirements

### SDK Integration Tests (new file: `tests/clob_v2_integration.test.ts`)

Mock the `ClobClient` — do NOT make real API calls in tests. Test:

1. `getClobClient()` returns null when PRIVATE_KEY is not set
2. `getClobClient()` creates a valid client when PRIVATE_KEY is set (mock ethers Wallet + SDK)
3. `PolymarketWallet.placeOrder()` calls `client.createAndPostOrder()` with correct args
4. `PolymarketWallet.placeOrder()` maps SDK response to internal `OrderPlacementResult` correctly
5. `OrderTracker` status polling uses SDK `getOrder()` method
6. `OrderTracker` cancel uses SDK `cancelOrder()` method
7. `reconcileBalance()` uses pUSD address and 1e18 decimals
8. Config validator succeeds/fails appropriately with V2 credential check

### Existing Tests
- All 260 existing passing tests must continue to pass
- Paper wallet tests are completely unaffected
- `npx tsc --noEmit` must be clean

---

## What NOT To Change

- `PaperWallet` — zero changes
- `src/data/trade_history.ts` — read-only, no auth, likely survives as-is
- `src/data/market_fetcher.ts` — uses Gamma API, not CLOB write endpoints
- Strategy logic — strategies generate signals; they don't know about CLOB versions
- Dashboard — displays wallet state; doesn't interact with CLOB directly
- Risk engine — version-agnostic

---

## Output

After all changes:
1. Run `npx tsc --noEmit` — must be clean
2. Run `npm test` — all existing + new tests must pass
3. List every file changed with a one-line summary
4. Note any design decisions not specified above
5. Flag any concerns about the SDK's actual behavior vs what the docs describe
6. If the installed SDK has a different API than described here, document the differences
