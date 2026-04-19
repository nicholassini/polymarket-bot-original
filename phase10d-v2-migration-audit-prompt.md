# Phase 10d — CLOB V2 Migration Audit & Plan

## CRITICAL CONTEXT

Polymarket is shipping a complete infrastructure upgrade on **April 28, 2026 at ~11:00 UTC**. After cutover, there is **zero backward compatibility** — V1 orders will be rejected. Our bot must migrate to V2 before going live.

**Do NOT modify any code yet.** This is a read-only audit to map every V1 touchpoint and produce a migration plan.

## What's Changing in V2

### 1. SDK Required
- V2 package: `@polymarket/clob-client-v2` (TypeScript) — replaces raw fetch() calls
- Also requires `ethers@5` for wallet signing
- Constructor uses options object: `new ClobClient({ host, chain, signer, creds, signatureType, funderAddress })`

### 2. Authentication
- API keys are derived via SDK: `client.createOrDeriveApiKey()` using a private key + ethers Wallet
- Orders must be EIP-712 signed (not just Bearer token auth)
- L1/L2 auth headers: POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_API_KEY, POLY_PASSPHRASE
- The simple `Authorization: Bearer <key>` approach will NOT work for V2

### 3. Order Struct Changes
- **Removed fields:** `nonce`, `feeRateBps`, `taker`, `expiration`
- **Added fields:** `timestamp` (ms), `metadata` (bytes32), `builder` (bytes32)
- EIP-712 domain version: `"1"` → `"2"`
- Fees are now set at match time by the protocol, not embedded in orders

### 4. Collateral Token
- USDC.e (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`) → pUSD (`0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`)
- Wrapping: USDC.e → pUSD via CollateralOnramp contract at `0x93070a847efEf7F70739046A929D47a521F5B8ee`
- For API traders, must call `wrap()` on the Onramp contract

### 5. Contract Addresses
| Contract | V1 Address | V2 Address |
|----------|-----------|-----------|
| CTF Exchange | 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E | 0xE111180000d2663C0091e4f400237545B87B996B |
| Neg Risk Exchange | 0xC5d563A36AE78145C45a50134d48A1215220f80a | 0xe2222d279d744050d28e00520010520000310F59 |
| Collateral | USDC.e 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 | pUSD 0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB |

### 6. Fee Model
- Fees are dynamic per market: `fee = C × feeRate × p × (1 - p)`
- Query via `client.getClobMarketInfo(conditionID)` — returns `fd.r` (rate), `fd.e` (exponent), `fd.to` (takerOnly)
- Makers are never charged fees, only takers pay

### 7. V2 Test Environment
- Test endpoint: `https://clob-v2.polymarket.com`
- After April 28, V2 takes over `https://clob.polymarket.com` (no URL change needed post-cutover)

### 8. V2 SDK Quickstart (for reference)
```typescript
import { ClobClient, Side, OrderType } from "@polymarket/clob-client-v2";
import { Wallet } from "ethers"; // v5.8.0

const signer = new Wallet(process.env.PRIVATE_KEY);

// Derive API credentials
const tempClient = new ClobClient({ host: "https://clob.polymarket.com", chain: 137, signer });
const apiCreds = await tempClient.createOrDeriveApiKey();

// Initialize trading client
const client = new ClobClient({
  host: "https://clob.polymarket.com",
  chain: 137,
  signer,
  creds: apiCreds,
  signatureType: 0, // EOA
  funderAddress: signer.address,
});

// Place an order
const response = await client.createAndPostOrder(
  { tokenID: "...", price: 0.5, size: 10, side: Side.BUY },
  { tickSize: "0.01", negRisk: false },
  OrderType.GTC,
);

// Check orders
const openOrders = await client.getOpenOrders();
const trades = await client.getTrades();
await client.cancelOrder(response.orderID);
```

---

## What To Audit

Read every file listed below. For each one, find EVERY reference to V1-specific things: CLOB URLs, contract addresses, USDC.e address, order field names, auth headers, raw fetch() calls to the CLOB API. Produce a comprehensive map.

### Files to read:

1. `src/wallets/polymarket_wallet.ts` — THE MAIN FILE. Contains all raw CLOB fetch() calls, order payload construction, auth headers, balance reconciliation (uses USDC.e address)
2. `src/execution/order_tracker.ts` — Polls CLOB for order status, uses CLOB headers
3. `src/data/clob_client.ts` — Helper for CLOB API headers/calls
4. `src/data/market_fetcher.ts` — Fetches markets from CLOB/Gamma API
5. `src/data/orderbook.ts` — Fetches orderbook data
6. `src/data/trade_history.ts` — Fetches trade history
7. `src/core/config_loader.ts` — Config parsing, CLOB URL, contract addresses
8. `src/core/config_validator.ts` — Validation including CLOB ping
9. `config.yaml` — Any hardcoded URLs or addresses
10. `package.json` — Current dependencies (no ethers, no clob-client currently)
11. `.env` — Current env var names
12. `src/types/order.ts` — Order interfaces/types
13. Any other file that references `clob`, `CLOB`, `polymarket`, `USDC`, `0x2791`, `0x4bFb41`, or `0xC5d563`

### Questions to Answer:

**A. CLOB API Surface**
1. List every fetch() call to the CLOB API with: file, line, HTTP method, endpoint path, headers sent, body structure
2. Which of these calls are V1-specific and will break?
3. Which calls are read-only (market data, orderbook) vs write (orders, cancels)?
4. Does the bot use any websocket connections to the CLOB?

**B. Authentication**
1. How does auth currently work? (Bearer token? HMAC? EIP-712?)
2. What env vars are used for auth?
3. Will the current auth approach work with V2? (Answer: NO if it's just a Bearer token)
4. What needs to change to support EIP-712 signed orders?

**C. Order Construction**
1. Where is the order payload built? Show the exact fields.
2. Which fields need to be removed (nonce, feeRateBps, taker, expiration)?
3. Which fields need to be added (timestamp, metadata, builder)?
4. Where does the bot reference feeRateBps — in order construction and in fee accounting?

**D. Contract Addresses & Collateral**
1. List every hardcoded or configurable reference to V1 contract addresses
2. List every reference to USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)
3. Where does the bot do on-chain balance checks? What token does it query?
4. What needs to change for pUSD?

**E. Dependencies**
1. Current `ethers` version? (expected: not installed)
2. Current `@polymarket/clob-client` version? (expected: not installed — raw fetch)
3. What new packages are needed? (`@polymarket/clob-client-v2`, `ethers@5`)

**F. Migration Complexity Assessment**

For each file that needs changes, classify the change:

- 🟢 **Simple** — update a URL, address, or field name
- 🟡 **Moderate** — restructure a function, change an interface
- 🔴 **Major** — replace entire approach (e.g., raw fetch → SDK client)

**G. Migration Strategy Recommendation**

Based on the audit, recommend one of:
1. **Refactor in place** — update polymarket_wallet.ts to use the V2 SDK instead of raw fetch
2. **Replace** — write a new polymarket_wallet_v2.ts from scratch using the SDK
3. **Hybrid** — use the SDK for order signing/submission but keep raw fetch for read-only endpoints

Consider:
- The bot currently has NO ethers dependency and NO SDK — this is a significant addition
- The SDK handles EIP-712 signing, nonce management (now timestamp), and fee calculation
- Read-only endpoints (markets, orderbook) may not need the SDK
- Write endpoints (orders, cancels) definitely need the SDK for signing
- Paper trading must remain unaffected

---

## Output

Write the report as `V2_MIGRATION_AUDIT.md` in the project root. Use sections A–G above. Include file:line references for every finding. 

End with a **Migration Checklist** — a numbered list of every concrete change needed, in the order they should be implemented, with effort estimates (S/M/L).
