# Phase 10c — Live Trading Wiring Audit

**Audit Date:** 2026-04-19  
**Auditor:** Claude (read-only, no code changes)  
**Prior Reference:** `LIVE_MIGRATION_GUIDE.md` (written 2026-04-08, 11 days prior)

---

## A. Live Wallet Creation Path

### A1. Does `PolymarketWallet` exist and is it fully implemented?

**Yes.** `src/wallets/polymarket_wallet.ts` is complete with:
- `placeOrder()` — submits to CLOB via `fetch POST /order` with retry logic
- `applyFill()` — applies confirmed fills from the OrderTracker
- `reconcileBalance()` — queries on-chain USDC.e balance via JSON-RPC
- `reserveBalance()` / `releaseReservation()` — prevents double-spend during async window
- `getDisplayName()` / `setDisplayName()` — dashboard display name support
- `startReconciliation()` / `stopReconciliation()` — periodic on-chain balance sync

### A2. Constructor arguments

```typescript
// polymarket_wallet.ts:45-51
constructor(
  config: WalletConfig,           // id, mode, strategy, capital, riskLimits, walletAddress?
  assignedStrategy: string,
  db?: Database,                  // SQLite DB for persistence (optional)
  liveCfg?: LiveTradingConfig,    // maxSingleOrderCost, maxPendingOrders, etc.
  feeCfg?: FeeConfig,             // takerFeeRate, makerFeeRate
)
```

`db`, `liveCfg`, and `feeCfg` are optional with safe defaults.

### A3. Where can a `PolymarketWallet` be instantiated?

Four instantiation sites exist:

| Site | File:Line | Args Passed | Completeness |
|---|---|---|---|
| config.yaml startup path | `wallet_manager.ts:70` | config, strategy, db, liveCfg, feeCfg | ✅ Full |
| Dashboard create-wallet API | `dashboard_server.ts:1829` | config, strategy only | ⚠️ Missing liveCfg, feeCfg, db |
| Dashboard restoreWallets (on boot) | `dashboard_server.ts:910` | config, strategy only | ⚠️ Missing liveCfg, feeCfg, db |
| Dashboard custom_composite path | `dashboard_server.ts:2108` | config, strategy only | ⚠️ Missing liveCfg, feeCfg, db |

Dashboard-created live wallets will use `DEFAULT_LIVE_CFG` (`maxSingleOrderCost: 100`, `minBalanceReserve: 0`) and `DEFAULT_FEE_CFG` (0% fees) regardless of what's in `config.yaml`.

### A4. Is there a dashboard UI flow for creating a LIVE wallet?

**Yes.** `dashboard_server.ts:3229` shows a `<select>` with a `LIVE` option. Guards at lines `1767–1773` (ENABLE_LIVE_TRADING env var) and `1778–1782` (paid subscription required) protect the endpoint. The mode selector also hides the LIVE option for free users (`dashboard_server.ts:4188–4190`).

### A5. Path to get a live wallet running

Two paths:

**Path 1 — config.yaml (recommended):** Set `mode: LIVE` on a wallet entry, set `environment.enable_live_trading: true`, set `ENABLE_LIVE_TRADING=true` env var. Full args passed to `PolymarketWallet`.

**Path 2 — Dashboard UI:** Create wallet from the Wallets tab with mode=LIVE. Requires paid subscription and `ENABLE_LIVE_TRADING=true`. Missing liveCfg/feeCfg — uses defaults.

---

## B. Credential Flow

### B1. All `process.env` references

| Variable | Location | Purpose | Default |
|---|---|---|---|
| `POLYMARKET_API_KEY` | `polymarket_wallet.ts:153` | Pre-flight check #1 | None — required for live |
| `POLYMARKET_API_KEY` | `clob_client.ts:15` | `getClobHeaders()` used by OrderTracker | None |
| `POLYMARKET_CLOB_API` | `polymarket_wallet.ts:56` | CLOB base URL for `placeOrder()` | `https://clob.polymarket.com` |
| `CLOB_API_URL` | `clob_client.ts:7` | CLOB base URL for OrderTracker | `https://clob.polymarket.com` |
| `POLYGON_RPC` | `polymarket_wallet.ts:329` | JSON-RPC for on-chain balance reconciliation | `https://polygon-rpc.com` |
| `ENABLE_LIVE_TRADING` | `config_loader.ts:59` | Dual-gate live trading enablement | `false` |

Note: `POLYMARKET_CLOB_API` (polymarket_wallet.ts) and `CLOB_API_URL` (clob_client.ts) are **two separate env vars** for the same URL. OrderTracker uses `CLOB_API_URL`; `placeOrder()` uses `POLYMARKET_CLOB_API`. If you override the CLOB URL, set **both**.

### B2. Per-wallet vs global credentials?

**Global only.** A single `POLYMARKET_API_KEY` is shared across all live wallets. There is no per-wallet credential support.

### B3. CLOB client constructor call

There is **no `@polymarket/clob-client` SDK** (not in `package.json`). All CLOB calls are raw `fetch()`:

```typescript
// polymarket_wallet.ts:213-221
apiResponse = await fetch(`${this.clobApi}/order`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify(orderPayload),
  signal: controller.signal,
});
```

### B4. Signature type

**None.** No EIP-712 signing, no private key, no `ethers` library in the codebase. Authentication is entirely via the `Authorization: Bearer <POLYMARKET_API_KEY>` HTTP header. Polymarket's backend handles proxy wallet signing internally. The signature type concept (EOA=0, Gnosis=1, proxy=2) is not relevant to this bot — it only uses the API key.

---

## C. Order Execution Path (Live)

### C1. Full path: signal → CLOB

```
Strategy.generateSignals()
  └→ Signal[]

Strategy.sizePositions(signals)
  └→ OrderRequest[] { walletId, marketId, outcome, side, price, size }

Engine.tick()  [engine.ts]
  └→ for each order:
       OrderRouter.route(order)  [order_router.ts:15-44]
         ├→ walletManager.getWallet(order.walletId)
         ├→ riskEngine.check(order, walletState)
         │    checks: killSwitch, balance, maxPositionSize,
         │            maxOpenTrades, dailyLoss, drawdown,
         │            perMarketExposure, orderRateLimit
         └→ tradeExecutor.execute(order, wallet)  [trade_executor.ts:5-13]
              └→ wallet.placeOrder(...)            [polymarket_wallet.ts:141]
                   └→ 6 pre-flight checks
                   └→ reserveBalance(cost)
                   └→ fetch POST /order to CLOB (2 retries, 10s timeout)
                   └→ releaseReservation(cost) + availableBalance -= cost
                   └→ trades.push(tradeRecord)
                   └→ return { status: 'submitted', orderId: clobOrderId }
              ← TradeExecutor DISCARDS return value — result is lost
```

**⚠️ Critical:** `TradeExecutor.execute()` calls `wallet.placeOrder()` and returns `void` (`trade_executor.ts:5`). The `OrderPlacementResult` is discarded. There is no call to `orderTracker.addPendingOrder()` anywhere in this path.

### C2. `OrderResult` comparison: paper vs live

| Field | PaperWallet | PolymarketWallet |
|---|---|---|
| `status` | `'filled'` or `'rejected'` | `'submitted'`, `'rejected'`, or `'error'` |
| `orderId` | locally generated UUID | CLOB-assigned `orderID` (falls back to local) |
| `filledSize` | actual simulated fill size | always `0` at submission |
| Fills position? | Yes, synchronously | Only via `applyFill()` — never called |
| Debits balance? | Yes, synchronously | Yes, at submission time |

### C3. The 6 pre-flight checks in `placeOrder()` (`polymarket_wallet.ts:150-186`)

1. **API key present** (line 153): `process.env.POLYMARKET_API_KEY` must be set
2. **Daily order limit** (line 160): `dailyOrderCount < maxDailyOrders`
3. **Max single order cost** (line 165): `price × size <= maxSingleOrderCost`
4. **Pending orders limit** (line 170): checks `orderTracker.getPendingForWallet()` — **always skipped** because `this.orderTracker` is always `null` (never injected via `setOrderTracker()`)
5. **Insufficient balance** (line 178): `getAvailableBalance() >= cost`
6. **Min balance reserve** (line 183): `available - cost >= minBalanceReserve`

Note: The audit prompt asks for 8 checks. The current code has 6 pre-flight checks in `placeOrder()`. The additional checks (kill switch, drawdown, exposure) live in `RiskEngine.check()` upstream.

### C4. Order ID handling

```typescript
// polymarket_wallet.ts:192
const orderId = `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
// ...after CLOB response:
// polymarket_wallet.ts:259
const clobOrderId = responseBody.orderID ?? orderId;  // CLOB ID preferred
```

A local ID is generated immediately (used for logging during the async window), then replaced by the CLOB-assigned `orderID` if present. The `clobOrderId` is what gets stored in the trade record.

### C5. Does `order_tracker.ts` handle live orders differently?

`OrderTracker` is live-only by design (paper fills are synchronous, no tracking needed). However, **OrderTracker is never started** — see Section G1 below.

---

## D. Balance & Risk Management (Live)

### D1. How does `PolymarketWallet` track balance?

**Internal state tracking only in practice.** `state.availableBalance` is updated at order submission (`polymarket_wallet.ts:263`). On-chain reconciliation is implemented via `reconcileBalance()` (line 323) but `startReconciliation()` is never called from `cli.ts` or `engine.ts` — it is dead code at runtime.

### D2. On-chain reconciliation logic

`reconcileBalance()` at `polymarket_wallet.ts:323-360`:
- Requires `walletAddress` in the wallet config (not currently populated from config.yaml — see E3)
- Calls Polygon RPC with ERC-20 `balanceOf(address)` against USDC contract `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- Warns if on-chain balance differs from `state.availableBalance` by more than 1 USDC
- Does NOT auto-correct the internal balance — warning only

`startReconciliation(intervalMs)` at line 363: never called from startup sequence.

### D3. Balance reservation pattern

```typescript
// polymarket_wallet.ts:189 — before async call
this.reserveBalance(cost);          // reserved += cost

// On CLOB success (line 261-263)
this.releaseReservation(cost);      // reserved -= cost
this.state.availableBalance -= cost;  // permanent debit

// getAvailableBalance() = availableBalance - reserved (line 93)
```

Pre-flight check #5 uses `getAvailableBalance()` which subtracts `reserved`. This prevents two simultaneous in-flight orders from both passing the balance check.

### D4. Partial fill handling

`OrderTracker._doPoll()` at `order_tracker.ts:161-168` handles `PARTIALLY_MATCHED`:
- Calls `applyConfirmedFill()` for the filled portion
- Updates `order.submission.size` to the remaining amount
- Keeps order in pending for continued polling

**However**, since OrderTracker is never started (see G1), partial fills are never processed in practice. The full order cost is debited at submission and positions are never updated.

### D5. Daily loss limit and kill switch integration

- **Daily loss limit** (`riskLimits.maxDailyLoss`): Checked by `RiskEngine.check()` before each order. Does NOT auto-activate the kill switch — just rejects the order.
- **Kill switch** (`kill_switch.ts:1-15`): In-memory flag only. Activated by:
  1. `POST /api/kill-switch/activate` (dashboard)
  2. Circuit breaker: 5 consecutive tick failures in the engine (not confirmed in the 100-line read of `engine.ts`, but referenced in LIVE_MIGRATION_GUIDE section 5.5)
- **Not integrated**: daily loss limit reaching its limit does NOT fire the kill switch. Wallets stop trading individually when their limit is hit, but the kill switch remains off.

---

## E. Configuration Requirements

### E1. Required `config.yaml` structure for a live wallet

```yaml
environment:
  enable_live_trading: true        # REQUIRED — must also set env var

wallets:
  - id: my_live_wallet
    mode: LIVE                     # REQUIRED
    strategy: momentum             # must be a registered strategy name
    capital: 100                   # REQUIRED — must be > 0
    # walletAddress: "0x..."       # OPTIONAL — needed for reconciliation, NOT read by config_loader

live_trading:                      # All fields optional — these are the conservative recommended values
  max_single_order_cost: 10        # default: 100 (too high for first run)
  max_pending_orders: 3            # default: 5
  max_daily_orders: 20             # default: 100
  order_timeout_seconds: 60        # default: 120
  min_balance_reserve: 20          # default: 0 (dangerous — set this!)

fees:
  taker_fee_rate: 0.02             # Polymarket taker fee
  maker_fee_rate: 0.0

polymarket:
  gamma_api: https://gamma-api.polymarket.com
  clob_api: https://clob.polymarket.com
```

**Required `.env` additions:**
```
POLYMARKET_API_KEY=<your_clob_api_key>
ENABLE_LIVE_TRADING=true
```

### E2. All validations in `config_validator.ts`

| Check | Location | Rule |
|---|---|---|
| API key set | line 9–13 | `POLYMARKET_API_KEY` must be non-empty if `enableLiveTrading` |
| Wallet capital | line 16–19 | Each wallet: `capital > 0` |
| Strategy names | line 22–27 | Each wallet strategy must be in `listStrategies()` |
| maxMarkets | line 30–35 | If set: integer, 1–10000 |
| maxSingleOrderCost | line 40–41 | `> 0` and `<= 1000` |
| maxPendingOrders | line 43–44 | Integer, `1–20` |
| maxDailyOrders | line 46–47 | Integer, `1–1000` |
| orderTimeoutSeconds | line 49–51 | `30–600` |
| minBalanceReserve | line 52–54 | `>= 0` |
| takerFeeRate | line 58–59 | `0–1` inclusive |
| makerFeeRate | line 61–63 | `0–1` inclusive |
| DASHBOARD_PORT | line 66–71 | Integer `1024–65535` if set |

Validation failure throws and prevents the engine from starting (`config_validator.ts:78-80`).

### E3. Hardcoded values to verify

| Value | Location | Notes |
|---|---|---|
| USDC contract `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | `polymarket_wallet.ts:327` | Polygon USDC.e — correct for Polygon mainnet |
| Default CLOB URL `https://clob.polymarket.com` | `polymarket_wallet.ts:56`, `clob_client.ts:7` | Current Polymarket CLOB endpoint — verify still active |
| Default Polygon RPC `https://polygon-rpc.com` | `polymarket_wallet.ts:329` | Public RPC — may be rate-limited; consider a dedicated RPC |
| USDC decimals `1e6` | `polymarket_wallet.ts:345` | Correct for USDC |
| Reconciliation threshold `1` USDC | `polymarket_wallet.ts:354` | Warns if drift > $1 |

### E4. `ENABLE_LIVE_TRADING` enforcement

- **`config_loader.ts:59`**: `const liveEnvEnabled = process.env.ENABLE_LIVE_TRADING === 'true'` (exact string match)
- **`config_loader.ts:74`**: `enableLiveTrading: liveRequested && liveEnvEnabled` (both must be true)
- **`wallet_manager.ts:60-65`**: If `config.mode === 'LIVE' && !enableLive` → falls back to PAPER mode with a warning (does NOT throw)
- **`dashboard_server.ts:1767-1773`**: Dashboard wallet creation blocks LIVE if `ENABLE_LIVE_TRADING !== 'true'`, returns HTTP 403

---

## F. Dependencies & Versions

### F1. `@polymarket/clob-client`

**Not installed.** It does not appear in `package.json` (checked at root). The bot uses raw `fetch()` for all CLOB API calls. This means:
- No SDK-managed signing, nonce, or EIP-712 support
- No SDK-managed API key derivation (`createApiKey()`)
- No SDK-managed L2 headers (if Polymarket ever requires them)

### F2. Other Polymarket-related dependencies

None. `package.json` dependencies: `bcryptjs`, `better-sqlite3`, `commander`, `dotenv`, `jsonwebtoken`, `pino`, `pino-pretty`, `stripe`, `yaml`. No blockchain libraries.

### F3. `ethers` version

**Not installed.** No `ethers` or `viem` in `package.json`. On-chain balance checks use raw JSON-RPC `eth_call` via `fetch()` (`polymarket_wallet.ts:335-344`). This eliminates version compatibility concerns but means no wallet signing capability.

---

## G. Gap Analysis

### G1. ❌ CRITICAL BLOCKER: `OrderTracker` is fully implemented but never started

This is the most important finding in this audit.

**Evidence:**
- `src/execution/order_tracker.ts` — fully implemented (252 lines): polls CLOB every 5s, handles MATCHED/PARTIALLY_MATCHED/CANCELLED/UNMATCHED, calls `wallet.applyFill()`, cancels timed-out orders via `DELETE /order/:id`
- `src/cli.ts` — `OrderTracker` is **not imported, not instantiated, not started**
- `src/core/engine.ts` — `OrderTracker` is **not imported, not instantiated**
- `src/execution/order_router.ts` — does not reference OrderTracker
- `src/execution/trade_executor.ts:5-13` — calls `wallet.placeOrder()` and returns `void`; the `OrderPlacementResult` (including `orderId`) is **discarded**; `orderTracker.addPendingOrder()` is never called

**Consequences of OrderTracker not being wired:**

| Consequence | Impact |
|---|---|
| `wallet.applyFill()` never called | Open positions are **never updated**. Dashboard shows 0 positions for LIVE wallets regardless of fills. |
| Pre-flight check #4 always skipped | `maxPendingOrders` limit never enforced (orderTracker is null at line 170) |
| No fill confirmation | Bot cannot know if orders fill, partially fill, or expire |
| No CLOB timeout/cancel | Orders that don't fill are left open on Polymarket's book indefinitely (until exchange timeout) |
| Crash recovery broken | `orderTracker.start()` restores pending orders from SQLite on boot — never called |

### G2. ❌ SECONDARY BLOCKER: Double-debit bug when OrderTracker is wired in

`placeOrder()` debits `availableBalance` at submission (line 263). If OrderTracker were then wired and called `wallet.applyFill()`, `applyFill()` also debits `availableBalance` (line 306). The cost would be subtracted twice.

The two paths are incompatible in their current form. Before wiring OrderTracker, one of these must change:
- **Option A (recommended):** `placeOrder()` keeps the reservation (don't release + debit at line 261-263). Let `applyFill()` be the single debit path.
- **Option B:** `applyFill()` only debits the fee portion (not the full cost), since the cost was already debited at submission.

### G3. ⚠️ Dashboard-created live wallets use wrong defaults

`dashboard_server.ts:910, 1829, 2108` all call `new PolymarketWallet(walletConfig, strategy)` without `liveCfg` or `feeCfg`. This means:
- `maxSingleOrderCost: 100` (vs the recommended `10` for first run)
- `minBalanceReserve: 0` (dangerous — bot can drain entire balance)
- `takerFeeRate: 0` (fees not applied — PnL will be overstated)

The config.yaml path (`wallet_manager.ts:70`) correctly passes `liveCfg` and `feeCfg`. Dashboard-created wallets need the same treatment.

### G4. ⚠️ `reconcileBalance()` never activated

`startReconciliation(intervalMs)` at `polymarket_wallet.ts:363` is never called from `cli.ts`, `engine.ts`, or the dashboard. The on-chain balance reconciliation is fully implemented but dead code. Additionally, `walletAddress` is not parsed from `config.yaml` (`config_loader.ts` raw config interface has no `wallet_address` field), so `reconcileBalance()` would silently return early even if called.

### G5. ⚠️ No startup API key validation

`config_validator.ts:9-13` only checks that `POLYMARKET_API_KEY` is non-empty — not that it's actually valid. An expired or wrong key is only discovered on the first live order attempt, which would return `status: 'rejected'` with the CLOB error body.

### G6. ⚠️ Silent code paths that fall back to paper mode

- `wallet_manager.ts:60-65`: LIVE wallet with `enableLive=false` silently registers as PAPER. A log warning is emitted (`logger.warn`) but no error is thrown. If you miss the log, you think you're live but you're paper.
- This is the correct behavior (safe default), but the warning should be impossible to miss.

### G7. ⚠️ Dashboard monitoring gaps for LIVE wallets

- Open positions are never populated (applyFill never called) — live wallet always shows 0 positions
- Fill history is missing — trade records get `filledSize: 0` and no PnL
- Dashboard `liveTradingEnabled` flag at line 996 correctly reflects whether any wallet has `mode === 'LIVE'`, but this is cosmetic if fills aren't being tracked

---

## Go-Live Readiness Verdict

### ❌ BLOCKED

The bot cannot go live safely in its current wiring state. Two blockers must be resolved first:

**BLOCKER 1 (Critical): Wire `OrderTracker` into the startup sequence**

Steps required in `cli.ts`:
1. Import `OrderTracker`
2. Instantiate: `const orderTracker = new OrderTracker(db, walletManager, process.env.POLYMARKET_API_KEY ?? '')`
3. Set timeout: `orderTracker.setOrderTimeoutMs(config.liveTrading.orderTimeoutSeconds * 1000)`
4. Inject into each live wallet: for each LIVE wallet, call `(wallet as PolymarketWallet).setOrderTracker(orderTracker)`
5. Wire `TradeExecutor` to call `orderTracker.addPendingOrder()` after a `'submitted'` result
6. Start: `orderTracker.start()` after `engine.start()`
7. Stop: `orderTracker.stop()` in `gracefulShutdown()`

**BLOCKER 2 (Critical): Fix double-debit in balance accounting**

Choose one of:
- **Option A**: Remove lines 261-263 from `placeOrder()` (don't debit at submission). Keep `reserveBalance()` before the fetch. Let `applyFill()` be the sole debit path. Release reservation on cancel/timeout.
- **Option B**: In `applyFill()` (line 299-311), remove `this.state.availableBalance -= (cost + fee)` and only apply `this.state.availableBalance -= fee` (since cost was already debited at submission). Release the reservation at submission (line 305) is already a no-op with this approach.

Option A is architecturally cleaner and matches what the OrderTracker/applyFill path was designed for.

---

**Once blockers are fixed, these caveats remain:**

| Caveat | Fix Required Before Live? |
|---|---|
| Dashboard live wallets missing liveCfg/feeCfg | Yes — pass `this.feeCfg` and liveCfg to dashboard PolymarketWallet constructors |
| `min_balance_reserve` defaults to 0 | Yes — set a non-zero value in config.yaml before first run |
| `max_single_order_cost` defaults to 100 | Recommend — set to 10 for first run |
| `reconcileBalance()` never activated | Recommended — call `startReconciliation(300_000)` after wallet creation for live wallets |
| `walletAddress` not parsed from config.yaml | Needed if you want reconciliation — add `wallet_address` field to `config_loader.ts` |
| API key not validated at startup | Low risk — add a pre-flight CLOB `/ok` ping in config_validator |
| Duplicate `CLOB_API_URL` env vars | Low risk — set both if overriding |
| Kill switch in-memory only | Acceptable — document that restart clears it |

---

## Changes Since `LIVE_MIGRATION_GUIDE.md` (2026-04-08)

The following HIGH-severity gaps from the migration guide have been **resolved** in the current code:

| Old Gap | Status |
|---|---|
| maxPendingOrders not enforced | ✅ Check #4 implemented (but gated on orderTracker, which is still null) |
| Balance not reserved at submission | ✅ `reserveBalance()` called before fetch |
| OrderTracker has no concurrency guard | ✅ `isPolling` flag prevents concurrent polls |
| Fees not accounted in PnL | ✅ `feeCfg` parameter added and used |
| PolymarketWallet missing getDisplayName/setDisplayName | ✅ Both implemented |

The one new critical issue introduced (or exposed by this audit) is that **OrderTracker is still not wired into cli.ts**, making all of the above improvements inactive for the production path.
