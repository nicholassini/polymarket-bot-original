# LIVE_MIGRATION_GUIDE.md
## Paper → Live Trading Migration Guide
### Polymarket Multi-Strategy Bot — Audit Date: 2026-04-08

---

> **Scope of this document:** This guide is based on a full read-only audit of every relevant source file in `~/polymarket-bot-original/`. Every claim is backed by specific code references. Where the code has gaps or risks, they are called out explicitly with ⚠️ warnings.

---

## Table of Contents

1. [Wallet Architecture Analysis](#section-1-wallet-architecture-analysis)
2. [Authentication & API Credentials](#section-2-authentication--api-credentials)
3. [Polymarket Account Setup Requirements](#section-3-polymarket-account-setup-requirements)
4. [Config Changes for Live Mode](#section-4-config-changes-for-live-mode)
5. [Safety Gates & Pre-flight Checks](#section-5-safety-gates--pre-flight-checks)
6. [Order Execution Flow (Live Path)](#section-6-order-execution-flow-live-path)
7. [Migration Checklist](#section-7-migration-checklist)
8. [Risk Assessment](#section-8-risk-assessment)
9. [Cost Analysis](#section-9-cost-analysis)

---

## Section 1: Wallet Architecture Analysis

### 1.1 Wallet Types

There are exactly two concrete wallet implementations, both in `src/wallets/`:

| Class | File | Purpose |
|---|---|---|
| `PaperWallet` | `paper_wallet.ts` | Simulates fills instantly using `FillSimulator`; no network calls |
| `PolymarketWallet` | `polymarket_wallet.ts` | Submits real orders to the CLOB REST API |

Both implement the `ExecutionWallet` interface defined in `wallet_manager.ts`.

### 1.2 How `wallet_manager.ts` Decides Between Paper and Live

The decision is made inside `WalletManager.registerWallet()`:

```typescript
// src/wallets/wallet_manager.ts:38-54
if (config.mode === 'LIVE' && !enableLive) {
  logger.warn(..., 'LIVE trading requested but ENABLE_LIVE_TRADING is false; refusing LIVE wallet');
  return;  // wallet is NOT registered — it simply vanishes
}

const wallet =
  config.mode === 'LIVE'
    ? new PolymarketWallet(config, assignedStrategy, this.db, liveTradingConfig)
    : new PaperWallet(config, assignedStrategy, this.db);
```

There are **two independent gates** that must both be open for a LIVE wallet to be registered:
1. `config.mode === 'LIVE'` in `config.yaml`
2. `enableLive === true`, which requires **both** `enable_live_trading: true` in `config.yaml` **and** `ENABLE_LIVE_TRADING=true` environment variable (see `config_loader.ts:81`)

⚠️ **Gap:** If a wallet has `mode: LIVE` but the gates are closed, `registerWallet()` silently returns without throwing. The wallet simply does not exist in the map. The engine will then skip it at `initialize()` (because `getWallet()` returns `undefined`), and no error is thrown. This could cause confusion on first run — a "LIVE" wallet in config silently becomes absent.

### 1.3 The `ExecutionWallet` Interface

Defined in `src/wallets/wallet_manager.ts:9-31`:

```typescript
export interface ExecutionWallet {
  getState(): WalletState;
  getTradeHistory(): TradeRecord[];
  placeOrder(request: { marketId, outcome, side, price, size }): Promise<OrderResult>;
  applyFill?(fill: OrderFill): void;              // live only — optional
  updateBalance(delta: number): void;
  getDisplayName?(): string;
  setDisplayName?(name: string): void;
  updateRiskLimits?(limits: Partial<RiskLimits>): void;
  resetDailyPnl?(): void;
  getDailyOrderCount?(): number;
}
```

`PolymarketWallet` implements all required methods plus `applyFill()`, `getDailyOrderCount()`, and `resetDailyPnl()`. It does **not** implement `getDisplayName()` or `setDisplayName()` — those are only on `PaperWallet`. This is fine for trading but means live wallets show `walletId` on the dashboard, not a custom display name.

### 1.4 Multiple Wallets (One Per Strategy)

Each wallet entry in `config.yaml` gets its own wallet instance registered with `WalletManager`. Each wallet has a `strategy` field, and `Engine.initialize()` creates one `StrategyRunner` per wallet. Wallets are completely isolated — separate capital, separate risk limits, separate pending order tracking, separate daily PnL counters.

The `WalletManager` stores them in a `Map<string, ExecutionWallet>` keyed by `walletId`. Orders from strategy A can never cross into wallet B.

### 1.5 Wallet Registration Flow in `cli.ts`

```
cli.ts start command
  1. loadConfig(options.config)          — parse config.yaml, read ENABLE_LIVE_TRADING env var
  2. validateConfig(config)              — throws if any validation rule fails
  3. new WalletManager(db)
  4. for each wallet in config.wallets:
       walletManager.registerWallet(wallet, wallet.strategy,
         config.environment.enableLiveTrading, config.liveTrading)
  5. new OrderTracker(db, walletManager, apiKey)
  6. orderTracker.setOrderTimeoutMs(config.liveTrading.orderTimeoutSeconds * 1000)
  7. engine.initialize()  — creates StrategyRunner per wallet
  8. engine.start() + orderTracker.start()
```

---

## Section 2: Authentication & API Credentials

### 2.1 Environment Variables Required for Live Trading

The following variables are read directly from `process.env` in the codebase:

| Variable | Required | Where Used | Notes |
|---|---|---|---|
| `POLYMARKET_API_KEY` | **Yes, for LIVE** | `polymarket_wallet.ts:120`, `clob_client.ts:15`, `config_validator.ts:10`, `cli.ts:211` | Bearer token sent as `Authorization: Bearer <key>` header |
| `ENABLE_LIVE_TRADING` | **Yes, for LIVE** | `config_loader.ts:68` | Must be exactly the string `"true"` |
| `DASHBOARD_API_KEY` | Recommended | `dashboard_server.ts:816` | Secures mutating dashboard endpoints (POST/PUT/DELETE). Without it, the dashboard warns and allows unauthenticated control |
| `DASHBOARD_PORT` | No | `cli.ts:215`, `config_validator.ts:57` | Defaults to `3000`. Must be 1024-65535 if set |
| `DASHBOARD_HOST` | No | `dashboard_server.ts:759` | Defaults to `127.0.0.1` (loopback only — safe default) |
| `CLOB_API_URL` | No | `clob_client.ts:7` | Defaults to `https://clob.polymarket.com` |
| `LOG_LEVEL` | No | `logs.ts:13` | Defaults to `"info"`. Set to `"debug"` for verbose output |
| `NODE_ENV` | No | `logs.ts:3` | Set to `"production"` to disable pino-pretty transport |

**Minimum required .env for live trading:**
```
POLYMARKET_API_KEY=<your_clob_api_key>
ENABLE_LIVE_TRADING=true
DASHBOARD_API_KEY=<a_strong_random_secret>
```

### 2.2 How API Credentials Are Derived / Created

**This bot does NOT implement `createOrDeriveApiKey()`.**

The `POLYMARKET_API_KEY` is consumed as a raw pre-configured string from the environment. There is no on-chain key derivation, no EIP-712 signing of credential creation requests, and no call to the Polymarket CLOB `/auth` endpoint within the codebase.

You must obtain the API key manually before running the bot in live mode (see Section 3).

### 2.3 Signature Types

⚠️ **This bot does NOT sign individual orders.**

The codebase comment about "EIP-712 order signing" refers to how the CLOB API works externally. Inside this bot, orders are submitted as JSON payloads over HTTPS with a Bearer token header. There is no wallet private key, no EIP-712 domain struct, and no signature construction anywhere in the source.

The authentication model is: API key (Bearer token) issued by Polymarket to an authorized wallet address. The CLOB API itself handles the on-chain settlement using the proxy wallet it issued the key to.

Signature types (EOA=0, Magic/email=1, Gnosis=2) are a Polymarket CLOB concept for account setup, not something this bot configures or negotiates.

### 2.4 Where the Private Key Is Used

**The bot does not use a private key.** There is no `POLYMARKET_PRIVATE_KEY`, `WALLET_PRIVATE_KEY`, or equivalent variable anywhere in `src/`. A search for `PRIVATE_KEY`, `signOrder`, `ethers.Wallet`, `viem`, and similar patterns returns zero results in the bot's own source code.

This means the bot cannot derive API credentials at startup. You must generate the API key externally (via Polymarket's website or CLI tools) and paste it into the environment.

### 2.5 API Key Derived at Startup or Per-Request

The API key is read from `process.env.POLYMARKET_API_KEY` at the time each request is made — not cached at startup. This means:
- Rotating the key by updating the env var requires a restart to fully take effect (because the process reads environment at launch; hot-reloading env vars mid-process is not supported).
- The key is checked on every `placeOrder()` call (pre-flight check #1) and on every CLOB fetch via `getClobHeaders()`.

### 2.6 Credential Storage

Credentials exist **only in memory** (process environment). The bot does not write credentials to disk, database, or any log file. The SQLite database at `.runtime/bot.db` stores wallet states and trade records — never credentials.

⚠️ **Risk:** If logs are shipped to a third-party service (e.g., Telegram webhook), ensure `LOG_LEVEL` is not set to `"debug"`, as debug logs could inadvertently expose request headers. Review `logs.ts` and `clob_client.ts` before enabling external log shipping.

---

## Section 3: Polymarket Account Setup Requirements

### 3.1 Wallet Options: EOA vs Proxy Wallet

The bot submits orders using an API key, not directly from a wallet signing transactions. Polymarket's CLOB issues API keys that are bound to a **Polymarket proxy wallet** (a smart contract wallet deployed on Polygon by Polymarket).

**What this bot supports:** Any wallet type for which you can obtain a CLOB API key — this includes EOA (MetaMask, hardware wallet like Ledger/Trezor), or the Polymarket-native proxy wallet created when you sign up at polymarket.com.

The proxy wallet is the recommended path: it is the address that holds your CTF outcome tokens, and it is the address Polymarket's CLOB will credit fills to.

### 3.2 Funding Path: Getting USDC.e onto Polygon

Polymarket uses **USDC.e** (bridged USDC) on **Polygon PoS (chain ID 137)**.

Steps:
1. Acquire USDC on any chain (Ethereum mainnet is simplest).
2. Bridge to Polygon using the official Polygon Bridge (https://wallet.polygon.technology) or a DEX aggregator bridge (e.g., Stargate, Across Protocol).
3. The destination address should be your **Polymarket proxy wallet address** (visible at polymarket.com → Profile → Deposit).
4. Alternatively, use Polymarket's in-app on-ramp (credit card via MoonPay/Transak) which deposits directly to your proxy wallet.

The bot's `config.yaml` `capital` field is the logical amount tracked by the bot — it does **not** automatically deposit or withdraw from the proxy wallet. You must ensure the actual on-chain balance matches or exceeds what the bot expects.

### 3.3 Gas Requirements

⚠️ **The bot does not check or manage gas.**

Polymarket's CLOB API uses a **gasless transaction model** for order placement: orders are signed off-chain and batched by Polymarket's relayer. You do NOT need POL (previously MATIC) in the proxy wallet for order placement.

However, POL may be needed for:
- Initial account setup / contract deployment (if using EOA mode)
- Direct on-chain CTF token transfers (not used by this bot)
- Emergency on-chain cancellations outside the CLOB

Keep a small amount of POL (~0.5-1 POL) in the wallet for any unforeseen on-chain operations. The bot itself will never spend it.

### 3.4 Token Allowances: CTF and USDC.e

⚠️ **The bot does NOT handle `setApprovalForAll()` or any ERC-20 `approve()` calls.**

Polymarket requires two one-time approvals before the CLOB can move tokens on your behalf:
1. **USDC.e allowance** — the CTF Exchange contract must be approved to spend your USDC.e.
2. **CTF (Conditional Token Framework) `setApprovalForAll()`** — the Exchange must be approved as an operator of your outcome tokens.

These approvals must be completed **before** the first live order. They can be set via:
- The Polymarket web interface (done automatically when you first deposit and trade manually).
- The `@polymarket/clob-client` JavaScript SDK's `setAllowances()` method (run once, outside this bot).

If allowances are not set, the CLOB will reject orders with a 4xx error, which this bot will log as `'Order rejected by CLOB API'` and return `status: 'rejected'`. The bot will NOT retry and will NOT alert you that allowances are missing vs. some other rejection reason.

### 3.5 Funder vs Signer: The Address Relationship

In the standard Polymarket setup:
- **Proxy wallet** = the address Polymarket deploys for you. It holds USDC.e and CTF outcome tokens. It is the **funder** address.
- **API key** = issued to the proxy wallet. The CLOB authenticates requests using this key and credits/debits the proxy wallet.

In EOA mode:
- Your EOA (e.g., MetaMask address) acts as both funder and signer.
- The CLOB API key is derived from the EOA's signature.

This bot only knows the API key. It does not know or track the on-chain address. The `config.yaml` `capital` field is a logical accounting number — the bot trusts it is accurate relative to the actual on-chain balance.

⚠️ **There is no on-chain balance check.** If the bot's internal `availableBalance` drifts from the actual on-chain balance (e.g., a manual trade done outside the bot, a withdrawal), the bot will continue placing orders without knowing the real balance has changed.

---

## Section 4: Config Changes for Live Mode

### 4.1 What YAML Changes Switch a Wallet from PAPER to LIVE

Three changes are required (all must be present):

```yaml
# 1. Top-level environment flag
environment:
  enable_live_trading: true   # was: false

# 2. Individual wallet mode
wallets:
  - id: my_live_wallet
    mode: LIVE              # was: PAPER
    strategy: momentum
    capital: 100

# 3. Environment variable (must ALSO be set — config.yaml alone is not enough)
# In your shell or .env file:
# ENABLE_LIVE_TRADING=true
```

From `config_loader.ts:67-81`:
```typescript
const liveRequested = Boolean(parsed.environment?.enable_live_trading ?? false);
const liveEnvEnabled = process.env.ENABLE_LIVE_TRADING === 'true';
// ...
enableLiveTrading: liveRequested && liveEnvEnabled,  // BOTH must be true
```

### 4.2 The Five Validated Live Trading Limits

Defined in `config_loader.ts` and enforced by `config_validator.ts`:

| YAML Key | TypeScript Field | Default | Validator Rule | Recommended Start |
|---|---|---|---|---|
| `max_single_order_cost` | `maxSingleOrderCost` | `50` USDC | `> 0` and `<= 1000` | `10` USDC |
| `max_pending_orders` | `maxPendingOrders` | `5` | integer, `1–20` | `3` |
| `max_daily_orders` | `maxDailyOrders` | `100` | integer, `1–1000` | `20` |
| `order_timeout_seconds` | `orderTimeoutSeconds` | `120` s | `30–600` | `60` s |
| `min_balance_reserve` | `minBalanceReserve` | `10` USDC | `>= 0` | `20` USDC |

**Notes on defaults:**
- The default `maxSingleOrderCost` of $50 is relatively high for a first live run. A $50 order at 0.50 price = 100 shares.
- `maxPendingOrders` is validated but **not enforced** in the order placement path (see Section 5.1).
- `minBalanceReserve` of $10 means the bot can deplete a wallet to $10.01 before stopping. For a $100 wallet, this is 10% reserve — reasonable.

### 4.3 Minimal Live Config Example (One Wallet)

```yaml
environment:
  enable_live_trading: true

wallets:
  - id: live_momentum_1
    mode: LIVE
    strategy: momentum
    capital: 100           # matches actual on-chain USDC.e balance
    risk_limits:
      max_position_size: 5       # shares per order
      max_exposure_per_market: 15 # USDC total in any one market
      max_daily_loss: 5          # stop trading this wallet if down $5 today
      max_open_trades: 3         # max simultaneous open positions
      max_drawdown: 0.05         # 5% drawdown from starting capital

live_trading:
  max_single_order_cost: 10      # max $10 per order (price × size)
  max_pending_orders: 3          # max 3 unconfirmed orders at once
  max_daily_orders: 20           # max 20 orders per calendar day UTC
  order_timeout_seconds: 60      # cancel after 60 seconds unmatched
  min_balance_reserve: 20        # never let balance drop below $20

polymarket:
  gamma_api: https://gamma-api.polymarket.com
  clob_api: https://clob.polymarket.com
  max_markets: 200               # limit market scanning to 200 markets

strategy_config:
  momentum:
    lookback_minutes: 15
```

**Keep all other wallets as PAPER or remove them.** Mixed mode is fully supported.

### 4.4 What Happens When Config Validator Rejects a Limit

The bot **refuses to start.** From `config_validator.ts:65-71`:
```typescript
for (const err of errors) {
  logger.error({ validationError: err }, 'Config validation failed');
}
if (errors.length > 0) {
  throw new Error(`Config validation failed with ${errors.length} error(s). See logs above.`);
}
```
The exception propagates to the `start` command action handler and exits the process. The bot will not reach `engine.start()`.

### 4.5 Mixed Mode: Some Wallets PAPER, Some LIVE

**Yes, fully supported.** Each wallet entry in `config.yaml` is registered independently. You can have:
```yaml
wallets:
  - id: paper_test
    mode: PAPER
    strategy: momentum
    capital: 1000

  - id: live_prod
    mode: LIVE
    strategy: momentum
    capital: 100
```

Both will run simultaneously, each with its own strategy runner, capital, and risk limits. The paper wallet simulates fills; the live wallet submits to CLOB.

---

## Section 5: Safety Gates & Pre-flight Checks

### 5.1 The Pre-flight Checks in `polymarket_wallet.ts`

`placeOrder()` runs the following checks in sequence, returning `status: 'rejected'` on the first failure:

| # | Check | Code Location | What It Does |
|---|---|---|---|
| 1 | **API key present** | `polymarket_wallet.ts:120-124` | Checks `POLYMARKET_API_KEY` is set and non-empty |
| 2 | **Size > 0** | `polymarket_wallet.ts:126-129` | Rejects orders with zero or negative size |
| 3 | **Price in range (0, 1)** | `polymarket_wallet.ts:131-134` | Price must be strictly between 0 and 1 (binary market probability) |
| 4 | **Max single order cost** | `polymarket_wallet.ts:136-141` | `price × size <= maxSingleOrderCost` |
| 5 | **Sufficient balance** | `polymarket_wallet.ts:143-146` | `availableBalance >= price × size` |
| 6 | **Min balance reserve** | `polymarket_wallet.ts:148-151` | `availableBalance - orderCost >= minBalanceReserve` |
| 7 | **Daily order count** | `polymarket_wallet.ts:153-156` | `dailyOrderCount < maxDailyOrders` |

Note: The pre-flight checks listed in the task brief mention 8 checks. The code has **7** checks in `placeOrder()`. There is no 8th distinct check in `polymarket_wallet.ts`. However, the `RiskEngine.check()` in the order routing layer adds additional checks before `placeOrder()` is even called (see below).

⚠️ **Missing check — `maxPendingOrders` is NOT enforced in `placeOrder()`:**
The `maxPendingOrders` field is stored in `liveCfg` and validated by the config validator, but there is no code in `placeOrder()` or `trade_executor.ts` that checks `orderTracker.getPendingForWallet(walletId).length >= maxPendingOrders` before submitting. This limit is **defined but not enforced at order time.** If a strategy fires rapidly, you can accumulate more pending orders than `maxPendingOrders` allows.

### 5.2 Risk Engine (`src/risk/risk_engine.ts`)

`RiskEngine.check()` runs before `TradeExecutor.execute()` and adds these checks:

| Check | Detail |
|---|---|
| **Kill switch** | Blocks ALL orders if `killSwitch.isActive()` |
| **Balance (BUY only)** | `orderCost <= wallet.availableBalance` |
| **Max position size** | `order.size <= wallet.riskLimits.maxPositionSize` (in shares) |
| **Max open trades** | `wallet.openPositions.length < wallet.riskLimits.maxOpenTrades` |
| **Daily loss limit** | `wallet.dailyPnl > -wallet.riskLimits.maxDailyLoss` |
| **Drawdown limit** | Current drawdown % < `wallet.riskLimits.maxDrawdown` |
| **Per-market exposure** | `existingExposure + orderCost <= wallet.riskLimits.maxExposurePerMarket` |
| **Order rate limit** | Max **20 orders/minute** for LIVE wallets (120/min for PAPER) |

These checks run in `OrderRouter.route()` → `riskEngine.check()` → if OK → `tradeExecutor.execute()` → `wallet.placeOrder()`.

### 5.3 Daily Order Count Limit

Yes. `PolymarketWallet` maintains `dailyOrderCount`, incremented after each successful order submission. The limit is `maxDailyOrders` (default: 100). When hit, `placeOrder()` returns `status: 'rejected'` with reason `'exceeded limit: maxDailyOrders'`.

The counter resets at UTC midnight via `resetDailyPnl()`, called from `WalletManager.checkDailyPnlReset()`, which is called at the start of every engine tick.

### 5.4 Max Order Size

The maximum order cost (not raw size) is `maxSingleOrderCost` in USDC (default: $50). This is `price × size`. There is no separate limit on raw share count in the `live_trading` section — the share count limit is `riskLimits.maxPositionSize` in the wallet config, enforced by the risk engine.

For example: with `maxSingleOrderCost: 10` and a price of $0.70, the maximum size is ~14.3 shares.

### 5.5 The Kill Switch

**Activation triggers:**
1. Dashboard API: `POST /api/kill-switch/activate` — manual trigger
2. Circuit breaker: 5 consecutive tick failures in `engine.ts:259-262` automatically activate it
3. On graceful shutdown: `cli.ts:261` activates kill switch as part of `shutdown()`

**Effect:** `RiskEngine.check()` returns `{ ok: false, reason: 'Global kill switch active' }` for every order. No new orders are placed.

**Deactivation:** Dashboard API only: `POST /api/kill-switch/deactivate`. There is no auto-reset. After a circuit-breaker trip, a human must explicitly deactivate via the dashboard.

**State persistence:** The kill switch is an in-memory flag in the `KillSwitch` class (`kill_switch.ts`). It is **not persisted to disk**. If the bot restarts, the kill switch is inactive by default. This is safe (the bot starts fresh) but means a restart clears the kill switch even if you wanted it to stay active.

### 5.6 Additional Safety Gates

The `ENABLE_LIVE_TRADING` env var + `enable_live_trading: true` in YAML is itself a safety gate — a double confirmation that you intend live trading.

The dashboard's mutating endpoints (wallet add/modify, kill switch control) are protected by `DASHBOARD_API_KEY` if set. Without it, anyone with network access to the dashboard port can activate/deactivate the kill switch.

⚠️ **No explicit "unlock" ceremony beyond env var + config flag.** There is no "I confirm I understand the risks" prompt, no minimum balance check against on-chain reality, and no connectivity pre-check to verify the CLOB API key is valid before the first order attempt.

---

## Section 6: Order Execution Flow (Live Path)

### 6.1 Complete Live Order Code Path

```
Strategy.generateSignals()
  └→ returns Signal[]

Strategy.sizePositions(signals)
  └→ returns OrderRequest[]  (walletId, marketId, outcome, side, price, size, strategy)

Engine.processSignals(runner)
  └→ for each order:
       OrderRouter.route(order)
         ├→ walletManager.getWallet(order.walletId)   — lookup wallet
         ├→ riskEngine.check(order, walletState)      — 8 risk checks
         │    IF ok: false → log warn + return false (order dropped)
         └→ tradeExecutor.execute(order, wallet)
              └→ wallet.placeOrder(...)
```

### 6.2 `PolymarketWallet.placeOrder()` → What Happens After Pre-flights

After passing all 7 pre-flight checks, the order is constructed as:
```typescript
const payload = {
  market: request.marketId,
  outcome: request.outcome,   // 'YES' | 'NO'
  side: request.side,         // 'BUY' | 'SELL'
  price: request.price,
  size: request.size,
  type: 'LIMIT',
};
```

Then submitted via `fetchWithRetry()`:
```typescript
fetchWithRetry(
  `${CLOB_API_URL}/order`,
  { method: 'POST', headers: { 'Content-Type': 'application/json', ...getClobHeaders() }, body: JSON.stringify(payload) },
  2,      // maxRetries = 2 (3 total attempts)
  15_000  // timeout per attempt = 15 seconds
)
```

### 6.3 EIP-712 Signing

**There is no EIP-712 signing in this bot.** The order payload is raw JSON, not an EIP-712 typed data structure. Authentication is entirely via the `Authorization: Bearer <POLYMARKET_API_KEY>` HTTP header. Polymarket's backend handles signing internally for the proxy wallet model.

### 6.4 CLOB Submission Details (`fetchWithRetry`)

From `src/utils/fetch_retry.ts`:
- **Max retries:** 2 (for order placement). Total attempts: 3 on 5xx errors only.
- **Timeout per attempt:** 15,000 ms (15 seconds)
- **Retry logic:** 5xx errors retry with exponential backoff (1s, 2s). 4xx errors return immediately without retry.
- **Total worst-case wait:** ~15s + 1s + 15s + 2s + 15s = ~48 seconds before giving up

### 6.5 `OrderResult` Statuses

Defined in `src/types/order.ts`:

| Status | Trigger | Balance Effect |
|---|---|---|
| `'submitted'` | 2xx from CLOB API | None (balance NOT debited yet) |
| `'filled'` | Paper wallet only (immediate simulate) | Balance debited synchronously |
| `'partially_filled'` | OrderTracker polls CLOB and sees `PARTIALLY_MATCHED` | Balance debited for filled portion |
| `'rejected'` | Pre-flight check failure OR 4xx from CLOB | No balance change |
| `'error'` | 5xx after retries OR network exception | No balance change |
| `'cancelled'` | Not returned by `placeOrder()` directly; used by OrderTracker | No balance change |

### 6.6 OrderTracker Fill Polling

When `placeOrder()` returns `status: 'submitted'`, `TradeExecutor` calls `orderTracker.addPendingOrder()`. The `OrderTracker` then polls every **5 seconds**:

```
OrderTracker (setInterval 5s)
  for each pending order:
    GET ${CLOB_API_URL}/order/${orderId}   (2 retries, 10s timeout)
    response.status:
      MATCHED       → applyConfirmedFill() → wallet.applyFill() → removePending()
      PARTIALLY_MATCHED → applyConfirmedFill() for partial → keep in pending with reduced size
      CANCELLED     → log warn + removePending()
      UNMATCHED     → increment checkCount, keep polling
    if ageMs > maxOrderAgeMs → cancelOrder() (DELETE /order/:id)
    if checkCount > 30        → cancelOrder() (treat as stale)
```

`applyFill()` in `PolymarketWallet` updates the position, calculates realized PnL, debits the balance, records the trade, and persists to SQLite.

### 6.7 Balance Update Timing

**Balance is ONLY debited when a fill is confirmed.** Not at submission time. This means:
- A submitted order ties up neither the bot's internal balance nor the real on-chain balance until the fill confirmation arrives.
- The bot can submit multiple orders that together exceed the actual balance if fills come back slowly.

⚠️ **This is a race condition risk.** If two strategies both generate signals simultaneously and both wallets have the same `walletId` (impossible by design — each wallet is separate), there would be a double-spend. But within a single wallet, if two orders are submitted before either fill is confirmed, neither pre-flight check will see the balance reduction. In practice this is partially mitigated because LIVE wallets have a 20 orders/minute rate limit and `maxDailyOrders`, but two fast consecutive orders CAN both pass the balance check and together exceed actual funds.

---

## Section 7: Migration Checklist

### Step 1: Prerequisites

- [ ] **1.1** Create or identify a Polymarket account at https://polymarket.com
- [ ] **1.2** Complete Polymarket KYC if required in your jurisdiction
- [ ] **1.3** Fund your Polymarket proxy wallet with USDC.e on Polygon (chain 137)
  - Bridge from Ethereum via https://wallet.polygon.technology, OR
  - Use Polymarket's in-app deposit (MoonPay/Transak)
- [ ] **1.4** Make at least one manual trade via the Polymarket web UI to ensure token allowances are set (`setApprovalForAll` for CTF tokens and USDC.e approval for the Exchange contract)
- [ ] **1.5** Obtain a CLOB API key: log into polymarket.com → Settings → API Keys (or use the `@polymarket/clob-client` SDK's `createApiKey()` function from a trusted machine)
- [ ] **1.6** Keep ~0.5 POL in the proxy wallet for emergency on-chain operations
- [ ] **1.7** Verify the on-chain USDC.e balance matches the `capital` you plan to set in `config.yaml`

### Step 2: Environment Setup

- [ ] **2.1** Create a `.env` file (or export variables in your shell) — do NOT commit this to git:
  ```
  POLYMARKET_API_KEY=<your_clob_api_key>
  ENABLE_LIVE_TRADING=true
  DASHBOARD_API_KEY=<generate a strong 32+ char random string>
  DASHBOARD_PORT=3000
  LOG_LEVEL=info
  ```
- [ ] **2.2** Add `.env` to `.gitignore` if not already present
- [ ] **2.3** Verify the API key is valid by making a manual `curl` request:
  ```bash
  curl -H "Authorization: Bearer $POLYMARKET_API_KEY" https://clob.polymarket.com/ok
  ```
  Expected response: `{"ok":true}` or similar

### Step 3: Config Changes

- [ ] **3.1** Edit `config.yaml`:
  - Set `environment.enable_live_trading: true`
  - Add one new wallet entry with `mode: LIVE`, conservative `capital`, and tight `risk_limits`
  - Leave all existing wallets as `mode: PAPER`
- [ ] **3.2** Add `live_trading:` block with conservative limits:
  ```yaml
  live_trading:
    max_single_order_cost: 10
    max_pending_orders: 3
    max_daily_orders: 20
    order_timeout_seconds: 60
    min_balance_reserve: 20
  ```
- [ ] **3.3** Start capital should be **at most 20-25% of your total on-chain balance** for the first week

### Step 4: First-Run Verification

- [ ] **4.1** Run the config validator in isolation first:
  ```bash
  node -e "require('./dist/core/config_validator').validateConfig(require('./dist/core/config_loader').loadConfig('config.yaml'))"
  ```
  (Or: start the bot and let it throw before the engine starts if validation fails)
- [ ] **4.2** Start the bot and immediately check logs for:
  - `"Registered wallet live_xxx (LIVE)"` — confirms LIVE wallet was registered
  - No `"LIVE trading requested but ENABLE_LIVE_TRADING is false"` warning
  - No `"Config validation failed"` error
- [ ] **4.3** Open the dashboard at `http://127.0.0.1:3000/dashboard`
- [ ] **4.4** Verify the live wallet shows `mode: LIVE` in the Wallets tab
- [ ] **4.5** Watch the console log for the first order attempt. Before any real money moves, confirm the bot is generating signals for the right markets
- [ ] **4.6** Let it run for 15 minutes. Verify no orders are placed that exceed your `max_single_order_cost`

### Step 5: Monitoring

- [ ] **5.1** Dashboard endpoints to watch:
  - `GET /api/data` — full overview payload (wallets, PnL, pending orders)
  - `GET /api/kill-switch/status` — kill switch state
  - `GET /healthz` — engine health (consecutive tick failures, last tick time, pending count)
  - `GET /api/stream` — SSE live updates
- [ ] **5.2** Log files: `pino` logs to stdout by default. In production (`NODE_ENV=production`), pipe to a file: `npm start 2>&1 | tee -a bot.log`
- [ ] **5.3** Watch for these log patterns that indicate problems:
  - `"Order rejected by CLOB API"` — could mean bad API key, bad allowances, or insufficient balance
  - `"LIVE order submitting"` followed by no `"LIVE fill confirmed"` — order sitting unmatched
  - `"Circuit breaker triggered"` — 5 tick failures, all trading paused
  - `"Daily loss limit breached"` — daily PnL limit hit for a wallet
- [ ] **5.4** Set up Telegram notifications: add `telegram_webhook_url` to `config.yaml`

### Step 6: Emergency Procedures

**To stop all trading immediately:**
1. Dashboard: `POST /api/kill-switch/activate` (with `Authorization: Bearer <DASHBOARD_API_KEY>`)
2. CLI: `npm run bot stop` (sends SIGTERM → graceful shutdown)
3. Hard kill: `kill -9 <pid>` — the bot will resume pending orders from SQLite on next start

**To cancel all pending orders:**
The `OrderTracker.stop()` method (called on graceful shutdown) sends `DELETE /order/:id` for every pending order. This only works if the bot is still running. If the bot crashes hard, pending orders remain on Polymarket's order book until they fill or expire (timeout is 60-120 seconds by default in the config).

**To cancel orders directly via Polymarket:**
- Log into https://polymarket.com and cancel orders from the UI, OR
- Use the CLOB API: `DELETE https://clob.polymarket.com/orders` with your API key

**To reset the kill switch after a circuit breaker trip:**
- Dashboard: `POST /api/kill-switch/deactivate`
- Or restart the bot (kill switch does not persist across restarts)

### Step 7: Scaling

- [ ] **7.1** After 1 week of stable live trading with one wallet, increase `capital` and loosen risk limits proportionally
- [ ] **7.2** To add a second live wallet with a different strategy, add another `mode: LIVE` entry to `config.yaml` — no code changes needed
- [ ] **7.3** The `live_trading` block applies globally to all live wallets. If you need different limits per wallet, this is currently not supported — all live wallets share the same `maxSingleOrderCost`, `maxDailyOrders`, etc.
- [ ] **7.4** `max_markets` in the polymarket block controls how many markets are scanned. Increase from 200 to 500-1000 as you gain confidence

---

## Section 8: Risk Assessment

### 8.1 Worst-Case Scenario with Current Safety Checks

A strategy generates a flood of BUY signals in a single tick. Because `maxPendingOrders` is not enforced at order submission time, and the `dailyOrderCount` check passes for each new order as long as the count is below `maxDailyOrders`, the bot could submit up to `maxDailyOrders` orders (default: 100) in a single tick. Each order costs up to `maxSingleOrderCost` (default: $50), so the theoretical maximum daily exposure is $5,000 per wallet.

With conservative recommended settings (`maxDailyOrders: 20`, `maxSingleOrderCost: 10`), worst case is $200/day per wallet.

### 8.2 Single Points of Failure

| SPOF | Impact | Mitigation in Code |
|---|---|---|
| `POLYMARKET_API_KEY` invalid/expired | All live orders rejected silently (no startup check) | None — only discovered on first order attempt |
| CLOB API down | Orders fail with `status: 'error'`; no fills | `fetchWithRetry` with 2 retries; pending orders eventually time out |
| Bot process crash | Pending orders left open on exchange | `OrderTracker` resumes from SQLite on restart |
| SQLite DB corruption | Wallet state lost, orders not resumed | No backup mechanism in the codebase |
| Single strategy crashes | Only affects that wallet's runner; other wallets continue | Per-strategy try/catch in `engine.ts:processSignals()` |
| Network partition | Orders hang until 15s timeout × 3 attempts = 45s | After timeout, returned as `status: 'error'` |

### 8.3 What Happens if the CLOB API Goes Down Mid-Order

- If down before submission: `fetchWithRetry` throws after retries; `placeOrder()` returns `status: 'error'`. Order is NOT added to `pending`. No balance change. Bot continues.
- If down after submission but before `orderId` is returned: The order may be on the exchange's book without the bot knowing. The bot returns `status: 'error'` because it failed to parse the response. This order is **orphaned** — no `OrderTracker` entry, no timeout/cancel.

⚠️ **Orphaned order risk**: If the CLOB accepts an order but the HTTP response is lost in transit (network cut between send and receive), the bot has no record of it. You would need to check the Polymarket UI manually to find and cancel these orders.

### 8.4 What Happens if the Bot Crashes with Pending Orders

On graceful shutdown (SIGTERM/SIGINT): `OrderTracker.stop()` attempts to cancel all pending orders via the CLOB API, then the process exits. This is the safe path.

On crash (SIGKILL, out-of-memory, unhandled exception outside the tick): Pending orders remain open. On next start, `OrderTracker.start()` calls `db.loadPendingOrders()` and resumes tracking them. Orders that have since filled will be discovered on the next poll and applied via `wallet.applyFill()`. Orders that timed out on Polymarket's side will come back as `CANCELLED`.

⚠️ **State reconciliation gap**: The wallet's in-memory `availableBalance` is restored from SQLite on startup, but the SQLite balance was last written at the previous tick's `persistWallets()` call. If a fill arrived between the last persist and the crash, the balance in SQLite may be stale. The bot will reapply the fill when it polls, but could briefly show an incorrect balance.

### 8.5 Race Conditions in Fill Tracking

1. **Double-spend on simultaneous submissions**: Two consecutive orders from the same wallet in the same tick both pass the balance pre-flight check because neither fill has been confirmed yet. Both deduct from the same `availableBalance` only after their respective fills arrive. Between submission and fill, the internal balance is optimistic. Mitigated by `maxPendingOrders` config (which is NOT enforced — see Section 5.1).

2. **Partial fill race**: If a partially-filled order is polled simultaneously in two `pollPendingOrders()` intervals (only possible if the poll interval races with itself, which the tick-guard partially prevents), `applyFill()` could be called twice for the same fill. The tick guard (`tickRunning` flag) is in `engine.ts`, not in `OrderTracker`. The `setInterval` in `OrderTracker` runs independently and has no concurrency guard.

⚠️ **`OrderTracker` has no lock.** If a poll round takes longer than 5 seconds (e.g., slow CLOB responses), the next interval fires and a second `pollPendingOrders()` call can run concurrently. Two concurrent polls could both see `MATCHED` for the same order and call `applyFill()` twice. This would double-credit the fill.

### 8.6 Recommended Starting Capital and Position Sizes

| Parameter | Recommended (First 2 Weeks) |
|---|---|
| Total live capital | $100–$200 maximum |
| `capital` per wallet | $100 |
| `max_single_order_cost` | $5–$10 |
| `max_daily_orders` | 10–20 |
| `max_exposure_per_market` | $15–$20 |
| `max_daily_loss` | $5 (5% of capital) |
| `max_drawdown` | 0.05 (5%) |
| `min_balance_reserve` | $20 (20% of capital) |

Start with a **single live wallet** running the strategy you have the most paper-trading evidence for. Do not run multiple live wallets simultaneously until the first wallet has traded for at least 2 weeks without triggering risk limits.

---

## Section 9: Cost Analysis

### 9.1 Polymarket Trading Fees

Polymarket's CLOB charges:
- **Taker fee:** 2% of order notional (the side that takes liquidity)
- **Maker fee:** 0% (providing liquidity is free, and makers may receive a rebate)

This bot submits **LIMIT orders** (`type: 'LIMIT'` in the payload). A limit order may act as maker or taker depending on whether it crosses the spread. If it sits on the book and is matched later, it is a maker (0% fee). If it crosses and fills immediately, it is a taker (2% fee).

**Fee impact example:** A $10 taker order on a $0.70 outcome token costs $0.20 in fees (2% of $10). On a $50 default order, that is $1.00 per fill.

⚠️ **The bot does NOT account for fees in its PnL calculation.** The `applyFill()` method computes PnL as `(fillPrice - entryPrice) × size` with no deduction for trading fees. This means the bot's reported PnL will be systematically optimistic. Real PnL = bot PnL minus fees.

### 9.2 Polygon Gas Costs

As noted in Section 3.3, Polymarket uses a gasless relayer model for order placement. Gas costs for normal trading are zero.

If you ever need to interact with the CTF contract directly (e.g., redeeming tokens after market resolution), those transactions require POL. Redemption via the Polymarket UI is gasless. Direct on-chain redemption costs approximately 0.001–0.003 POL per transaction at typical Polygon gas prices (~30-100 gwei). At ~$0.50/POL, this is fractions of a cent.

### 9.3 API Rate Limits and Tier Requirements

Polymarket's CLOB API rate limits are not documented in this codebase. Based on public knowledge:
- **Standard tier:** ~100 requests/minute on the order endpoint
- **No tier system** is documented for the public CLOB API as of this audit

The bot's risk engine caps LIVE wallets at **20 orders/minute** (hardcoded in `risk_engine.ts:70`), which is well within standard limits.

The Gamma API (market data) is polled every 15 seconds by `OrderbookStream`, which is very conservative.

### 9.4 Minimum USDC.e Balance

Absolute minimum to place a single order:
- `min_balance_reserve` (default: $10) + at least one `max_single_order_cost` (default: $50) = **$60 minimum**

Practical minimum for meaningful testing with conservative settings:
- Reserve ($20) + 10 orders × $10 each = **$120**

Recommended starting balance for the first live wallet:
- **$100–$200** with the conservative config in Section 4.3

---

## Summary of Critical Gaps

The following are gaps or concerns found during this audit that must be resolved before going live:

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | ⚠️ HIGH | `maxPendingOrders` is configured and validated but never enforced at order placement time | `polymarket_wallet.ts`, `trade_executor.ts` |
| 2 | ⚠️ HIGH | Balance is not debited at order submission time — two fast orders can together exceed real funds | `polymarket_wallet.ts:applyFill()` |
| 3 | ⚠️ HIGH | `OrderTracker` has no concurrency guard — two parallel poll intervals can double-apply the same fill | `order_tracker.ts:pollPendingOrders()` |
| 4 | ⚠️ HIGH | No on-chain balance verification — bot's internal `availableBalance` may diverge from real wallet | `config_loader.ts`, `polymarket_wallet.ts` |
| 5 | ⚠️ HIGH | Trading fees are not deducted from PnL — reported profits are systematically overstated | `polymarket_wallet.ts:applyFill()` |
| 6 | ⚠️ MEDIUM | API key validity is not checked at startup — invalid key is discovered only on first live order | `config_validator.ts` |
| 7 | ⚠️ MEDIUM | Orphaned orders possible if network cuts between send and receive of CLOB response | `polymarket_wallet.ts:placeOrder()` |
| 8 | ⚠️ MEDIUM | Kill switch is in-memory only — a restart clears it, even if it was tripped by circuit breaker | `kill_switch.ts` |
| 9 | ⚠️ MEDIUM | Dashboard has no authentication on GET endpoints — anyone with network access can view wallet state | `dashboard_server.ts` |
| 10 | ⚠️ LOW | `PolymarketWallet` does not implement `getDisplayName()`/`setDisplayName()` — live wallets show ID only on dashboard | `polymarket_wallet.ts` |
| 11 | ⚠️ LOW | `live_trading` limits are global — all live wallets share the same `maxSingleOrderCost`, `maxDailyOrders`, etc. | `config_loader.ts`, `polymarket_wallet.ts` |

Before deploying real money, items 1–5 should be addressed. Items 1 (maxPendingOrders enforcement) and 3 (OrderTracker concurrency) are particularly important as they represent logical errors in the safety system rather than missing features.
