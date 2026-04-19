# V2 Migration Audit — Polymarket CLOB V2

**Audit date:** 2026-04-19  
**Cutover deadline:** 2026-04-28 ~11:00 UTC  
**Status:** READ-ONLY AUDIT — no code changed

---

## A. CLOB API Surface

### A1. Every fetch() call to the CLOB API

| # | File | Line | Method | Endpoint | Headers | Body |
|---|------|------|--------|----------|---------|------|
| 1 | `src/wallets/polymarket_wallet.ts` | 213 | POST | `${clobApi}/order` | `Authorization: Bearer <POLYMARKET_API_KEY>`, `Content-Type: application/json` | `{market, side, outcome, price, size, type}` |
| 2 | `src/execution/order_tracker.ts` | 134 | GET | `${CLOB_API_URL}/order/${orderId}` | `getClobHeaders()` → `Authorization: Bearer <key>` | none |
| 3 | `src/execution/order_tracker.ts` | 232 | DELETE | `${CLOB_API_URL}/order/${orderId}` | `getClobHeaders()` → `Authorization: Bearer <key>` | none |
| 4 | `src/core/config_validator.ts` | 17 | GET | `${clobApi}/` | `Authorization: Bearer <POLYMARKET_API_KEY>` | none |
| 5 | `src/data/trade_history.ts` | 30 | GET | `${clobApi}/prices-history?market=...&interval=...&fidelity=...` | none | none |
| 6 | `src/wallets/polymarket_wallet.ts` | 334–341 | POST | Polygon RPC (`POLYGON_RPC`) | `Content-Type: application/json` | `eth_call` on USDC.e contract |

### A2. Which calls are V1-specific and will break?

- **#1 POST /order** — V1 payload structure + Bearer token. **WILL BREAK.** V2 requires SDK-constructed EIP-712 signed order via `client.createAndPostOrder()`.
- **#2 GET /order/{id}** — Bearer token auth. May or may not break depending on whether V2 REST status endpoints still accept Bearer. **Treat as breaking** — update to V2 L2 auth headers.
- **#3 DELETE /order/{id}** — Bearer token auth. Same risk as #2. **Treat as breaking.**
- **#4 GET /** credential check — uses Bearer token. **WILL BREAK** as startup validation (401/403 won't be the right signal anymore).
- **#5 GET /prices-history** — no auth, read-only. Likely survives cutover unchanged. **Low risk.**
- **#6 Polygon RPC eth_call** — Not a CLOB call. Uses USDC.e address. **Must update address** (pUSD) and decimal handling (6→18 decimals).

### A3. Read-only vs write

- **Read-only:** #2 GET /order/{id} (status polling), #5 GET /prices-history
- **Write:** #1 POST /order, #3 DELETE /order/{id}

### A4. WebSocket connections

**None.** Searched all `src/**/*.ts` for `WebSocket`, `ws://`, `wss://` — zero matches. The bot is fully HTTP poll-based.

---

## B. Authentication

### B1. Current auth approach

Bearer token. A single API key (`POLYMARKET_API_KEY`) is placed in `Authorization: Bearer <key>` headers via `getClobHeaders()` (`src/utils/clob_client.ts:14–20`) and directly in `polymarket_wallet.ts:216–218` and `config_validator.ts:17–20`.

### B2. Env vars used for auth

| Env Var | Used In | Purpose |
|---------|---------|---------|
| `POLYMARKET_API_KEY` | `clob_client.ts:15`, `polymarket_wallet.ts:153`, `config_validator.ts:11,38` | Bearer token for all CLOB calls |
| `POLYGON_RPC` | `polymarket_wallet.ts:327` | RPC endpoint for on-chain balance checks |

**Missing for V2:** `POLYMARKET_PRIVATE_KEY` (required for ethers Wallet signer, which derives API credentials and signs orders).

### B3. Will current auth work with V2?

**NO.** Bearer token is rejected for all write operations in V2. Even read operations may require V2's L1/L2 headers depending on the endpoint.

### B4. What needs to change for EIP-712 support

1. Add `POLYMARKET_PRIVATE_KEY` env var.
2. Install `ethers@^5.8.0` and `@polymarket/clob-client-v2`.
3. At startup, construct an `ethers.Wallet(process.env.POLYMARKET_PRIVATE_KEY)` signer.
4. Call `client.createOrDeriveApiKey()` to obtain `{key, secret, passphrase}`.
5. Construct a fully initialized `ClobClient` with `{host, chain: 137, signer, creds, signatureType: 0, funderAddress}`.
6. Replace `getClobHeaders()` in `clob_client.ts` with either the SDK client or a function that builds V2 L1/L2 headers: `POLY_ADDRESS`, `POLY_SIGNATURE`, `POLY_TIMESTAMP`, `POLY_API_KEY`, `POLY_PASSPHRASE`.
7. Replace `config_validator.ts` startup ping to use `client.getServerTime()` or similar SDK-native health check.

---

## C. Order Construction

### C1. Where the order payload is built

`src/wallets/polymarket_wallet.ts:194–201`:

```typescript
const orderPayload = {
  market: request.marketId,    // → V2 uses tokenID, not marketId
  side: request.side,          // survives (BUY/SELL)
  outcome: request.outcome,    // → V2 doesn't use outcome field
  price: request.price,        // survives
  size: request.size,          // survives
  type: 'limit',               // → V2 uses OrderType enum from SDK
};
```

### C2. Fields to remove

The current payload does **not** include `nonce`, `feeRateBps`, `taker`, or `expiration` — these V1 fields were never added to this bot's implementation. However:
- `market` (used as `marketId`) → V2 requires `tokenID` (the CLOB token ID, not the market's numeric ID)
- `outcome` (`'YES'|'NO'`) → Not a V2 SDK field; the `tokenID` encodes the outcome
- `type: 'limit'` → V2 uses `OrderType.GTC` enum from the SDK

### C3. Fields to add

The V2 SDK handles `timestamp`, `metadata`, and `builder` internally. The caller passes only `{ tokenID, price, size, side }` to `client.createAndPostOrder()`. The bot's `OrderSubmission` type currently only carries a `marketId` — it must also carry the `tokenID` (CLOB token ID for the specific outcome/side).

### C4. feeRateBps references

- **Order payload:** `feeRateBps` is not in the current order payload — no change needed here.
- **Fee accounting:** `polymarket_wallet.ts:299` uses `this.feeCfg.takerFeeRate` (from `FeeConfig`) to compute `fee = cost * takerFeeRate`. This is a static rate read from `config.yaml:5` (`taker_fee_rate: 0.02`).
- **V2 impact:** Fees in V2 are dynamic per market: `fee = C × feeRate × p × (1 - p)`. The static `taker_fee_rate` in config will be incorrect after cutover. To get accurate fees, call `client.getClobMarketInfo(conditionID)` and use the returned `fd.r` (rate) and `fd.e` (exponent). Makers pay no fees.

---

## D. Contract Addresses & Collateral

### D1. V1 contract address references

| Address | Location | Type |
|---------|----------|------|
| `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | `polymarket_wallet.ts:326` | USDC.e — hardcoded in `reconcileBalance()` |
| `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | `config.yaml:222` | whale scanner `usdcContractAddress` |
| `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | `src/whales/whale_types.ts:743` | default scanner config |

**CTF Exchange** (`0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`) and **Neg Risk Exchange** (`0xC5d563A36AE78145C45a50134d48A1215220f80a`) are **not hardcoded** anywhere in source. The bot doesn't interact with contracts directly for order placement (raw CLOB API only). No changes needed for exchange contract addresses.

### D2. USDC.e references — 3 locations

1. `src/wallets/polymarket_wallet.ts:326` — hardcoded string in `reconcileBalance()`
2. `config.yaml:222` — whale scanner config key `usdcContractAddress`
3. `src/whales/whale_types.ts:743` — default config object

### D3. On-chain balance checks

- `polymarket_wallet.ts:322–358` — `reconcileBalance()` — calls Polygon RPC with `eth_call` → `balanceOf(walletAddress)` on the USDC.e contract. Divides raw result by `1e6` (6 decimals).
- `src/whales/whale_scanner.ts:2541–2542` — whale wallet balance lookups using `scannerConfig.polygonRpcUrl` and `scannerConfig.usdcContractAddress`.

### D4. What needs to change for pUSD

1. **`polymarket_wallet.ts:326`** — Change `USDC_CONTRACT` to `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`.
2. **`polymarket_wallet.ts:344`** — Change divisor from `1e6` to `1e18` (pUSD has 18 decimals, not 6).
3. **`config.yaml:222`** — Update `usdcContractAddress` to `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`.
4. **`src/whales/whale_types.ts:743`** — Update default `usdcContractAddress`.
5. **Wrapping:** For live trading, USDC.e must be wrapped to pUSD via the CollateralOnramp contract (`0x93070a847efEf7F70739046A929D47a521F5B8ee`). This is an on-chain `wrap()` call — likely a one-time manual operation before go-live, but if the bot manages this automatically it needs a new code path.

---

## E. Dependencies

### E1. Current ethers version

**Not installed.** No `ethers` in `package.json` dependencies or devDependencies.

### E2. Current @polymarket/clob-client version

**Not installed.** The bot uses raw `fetch()` calls — no Polymarket SDK dependency.

### E3. New packages required

| Package | Version | Purpose |
|---------|---------|---------|
| `@polymarket/clob-client-v2` | latest | Order signing, submission, cancellation, status queries |
| `ethers` | `^5.8.0` | `Wallet` signer for EIP-712; required peer dep of the SDK |

**Note:** `ethers` v5 and v6 have incompatible APIs. The SDK requires v5. If any other dep pulls in ethers v6, there will be a conflict to resolve.

---

## F. Migration Complexity Assessment

| File | Change Required | Complexity |
|------|----------------|-----------|
| `src/wallets/polymarket_wallet.ts` | Replace raw `fetch('/order')` with `client.createAndPostOrder()`; update `USDC_CONTRACT` address + decimal divisor in `reconcileBalance()`; may need `tokenID` on `OrderSubmission` | 🔴 **Major** |
| `src/utils/clob_client.ts` | Replace `getClobHeaders()` (Bearer token) with V2 L1/L2 auth header builder or SDK client singleton; `CLOB_API_URL` constant survives unchanged | 🔴 **Major** |
| `src/execution/order_tracker.ts` | Update GET/DELETE calls to use V2 auth headers; response field names (`status`, `size_matched`) may change slightly | 🟡 **Moderate** |
| `src/core/config_validator.ts` | Replace Bearer-based startup ping with SDK health check; add `POLYMARKET_PRIVATE_KEY` validation | 🟡 **Moderate** |
| `src/types/order.ts` | Add `tokenId` to `OrderSubmission`; no field removals needed | 🟡 **Moderate** |
| `src/data/trade_history.ts` | `/prices-history` endpoint likely unchanged; no auth headers used; low risk | 🟢 **Simple** |
| `config.yaml` | Update `usdcContractAddress` (whale scanner section) | 🟢 **Simple** |
| `src/whales/whale_types.ts` | Update default `usdcContractAddress` | 🟢 **Simple** |
| `.env.example` | Add `POLYMARKET_PRIVATE_KEY`; update comment for `POLYMARKET_API_KEY` (now derived, not pasted) | 🟢 **Simple** |
| `package.json` | Add `@polymarket/clob-client-v2` + `ethers@^5.8.0` | 🟢 **Simple** |

---

## G. Migration Strategy Recommendation

**Recommendation: Hybrid**

Use the V2 SDK for all write operations (order placement and cancellation) while keeping raw `fetch()` for read-only endpoints that don't require auth or that the SDK also exposes as thin wrappers.

**Rationale:**

- **Order placement** (`polymarket_wallet.ts` POST /order) cannot be patched — it must use `client.createAndPostOrder()` because the SDK handles EIP-712 signing, `timestamp`, `metadata`, and `builder` fields internally. This is a full replacement of the submission code path.
- **Cancel and status** (`order_tracker.ts` GET/DELETE /order/{id}) could theoretically be done with raw fetch + V2 headers, but using `client.cancelOrder()` and `client.getOrder()` from the SDK is safer and better-maintained.
- **Read-only endpoints** (`trade_history.ts` GET /prices-history, `market_fetcher.ts` Gamma API) have no auth requirements and their URLs are stable. Keeping them as raw fetch avoids unnecessary SDK surface area.
- **Paper trading is unaffected:** `PaperWallet` never calls any CLOB endpoint. All V2 changes are isolated to `PolymarketWallet` (live mode only).

**Why not "Refactor in place" (raw fetch with V2 headers)?**  
EIP-712 order signing is non-trivial to implement manually — the SDK exists precisely to handle this. Bypassing it risks subtle signing bugs that cause silent order rejections.

**Why not "Replace" (new polymarket_wallet_v2.ts from scratch)?**  
The pre-flight risk checks, reservation system, fill tracking, and trade record logic in `polymarket_wallet.ts` are solid and version-agnostic. Only the CLOB interaction layer (order submission, status polling, cancellation) needs replacing.

---

## Migration Checklist

Ordered by dependency — complete each step before starting the next.

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 1 | Install `@polymarket/clob-client-v2` and `ethers@^5.8.0` | `package.json` | S |
| 2 | Add `POLYMARKET_PRIVATE_KEY` to `.env.example`; update `POLYMARKET_API_KEY` comment (key is now derived, not pasted from UI) | `.env.example` | S |
| 3 | Add `POLYMARKET_PRIVATE_KEY` validation to `config_validator.ts` (required when live trading enabled) | `src/core/config_validator.ts` | S |
| 4 | Add `tokenId` field to `OrderSubmission` interface (the CLOB token ID for the specific outcome) | `src/types/order.ts` | S |
| 5 | Create SDK singleton: a `getClobClient()` factory in `src/utils/clob_client.ts` that builds an authenticated `ClobClient` from `POLYMARKET_PRIVATE_KEY` using `createOrDeriveApiKey()` | `src/utils/clob_client.ts` | M |
| 6 | Update `getClobHeaders()` (or add `getClobV2Headers()`) in `clob_client.ts` to emit V2 L1/L2 auth headers for raw-fetch callers (order tracker) | `src/utils/clob_client.ts` | M |
| 7 | Replace `polymarket_wallet.ts` order submission: swap raw `fetch('/order')` block with `client.createAndPostOrder({tokenID, price, size, side}, {tickSize, negRisk}, OrderType.GTC)` | `src/wallets/polymarket_wallet.ts` | L |
| 8 | Update `reconcileBalance()` in `polymarket_wallet.ts`: change `USDC_CONTRACT` to pUSD address `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` and divisor from `1e6` to `1e18` | `src/wallets/polymarket_wallet.ts` | S |
| 9 | Update `order_tracker.ts` GET status and DELETE cancel calls to use V2 auth headers (or replace with `client.getOrder()` / `client.cancelOrder()` SDK methods) | `src/execution/order_tracker.ts` | M |
| 10 | Update `config_validator.ts` startup credential check: replace Bearer ping with SDK-based health check (e.g., `client.getServerTime()` or `client.createOrDeriveApiKey()` dry-run) | `src/core/config_validator.ts` | M |
| 11 | Update `config.yaml` whale scanner `usdcContractAddress` to pUSD: `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` | `config.yaml` | S |
| 12 | Update `whale_types.ts` default scanner config `usdcContractAddress` to pUSD | `src/whales/whale_types.ts` | S |
| 13 | Update `whale_scanner.ts` balance-check decimal handling from `/ 1e6` to `/ 1e18` for pUSD (search for the eth_call division site) | `src/whales/whale_scanner.ts` | S |
| 14 | Verify V2 fee model: replace static `taker_fee_rate` in `applyFill()` with dynamic fee from `client.getClobMarketInfo(conditionID)` — or at minimum update config default and document the limitation | `src/wallets/polymarket_wallet.ts`, `config.yaml` | M |
| 15 | Test against `https://clob-v2.polymarket.com` (V2 test endpoint) before April 28 cutover; run existing test suite; verify order submission, fill detection, and cancel flows | all | L |

**Total effort estimate:** ~5–8 engineering days for a careful, tested migration.  
**Critical path:** Steps 1 → 5 → 7 → 9 (must complete in order; everything else is parallelizable after step 1).
