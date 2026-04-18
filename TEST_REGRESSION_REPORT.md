# Test Regression Report
**Generated:** 2026-04-10  
**Scope:** Full vitest suite — all 17 test files, 244 tests  
**Final result:** 17 passed / 0 failed

---

## Summary

Starting state (from POST_OVERNIGHT_FIXES.md): 7 failed test files, 67 failed tests, 177 passing.  
After root-cause investigation and fixes: **244/244 tests passing, 0 failures.**

---

## Failures Investigated and Fixed

### 1. `tests/polymarket_wallet.test.ts` — `applyFill` did not release reservation

**Test:** "releases reservation on confirmed fill via applyFill"  
**Failure:** `expected 990 to be 995`

**Root cause:** `PolymarketWallet.applyFill()` deducted `cost + fee` from `state.availableBalance` but did not call `releaseReservation(cost)`. Since `getAvailableBalance()` returns `state.availableBalance - reserved`, the reservation from the prior `reserveBalance(5)` call was still outstanding, producing a double-deduction (–5 from reservation + –5 from applyFill = –10 apparent deduction).

**Fix:** Added `this.releaseReservation(cost)` at the start of `applyFill()` before decrementing the balance. This matches the intended semantics: `placeOrder` reserves funds optimistically when the order is sent; `applyFill` releases that reservation and makes the permanent deduction.

**File:** `src/wallets/polymarket_wallet.ts`

---

### 2. `tests/fee_accounting.test.ts` — Migration fails on legacy schema missing `order_id`

**Test:** "migration: adds fee columns to existing DB without them"  
**Failure:** `SqliteError: table trades has no column named order_id`

**Root cause:** The migration test creates a legacy SQLite `trades` table with only the old columns (`id, walletId, marketId, outcome, side, price, size, fillPrice, slippage, timestamp`). The `_ensureColumn` migration path only added `fee_amount`, `fee_rate`, and `order_type`. When `_prepareStatements()` ran, it tried to prepare an `INSERT INTO trades (order_id, ...)` statement against the old table — which had no `order_id` column — causing the crash.

**Fix:** Extended the `initSchema()` migration block in `Database` to call `_ensureColumn` for all structural columns that may be absent in a legacy schema: `order_id`, `wallet_id`, `market_id`, `outcome`, `side`, `price`, `size`, `cost`, `realized_pnl`, `cumulative_pnl`, `balance_after`, `timestamp`. These are no-ops on new databases (columns already exist) and additive on old ones.

**File:** `src/storage/database.ts`

---

### 3. `tests/dashboard_auth.test.ts` — Missing `/healthz` and `/api/kill-switch/activate` routes

**Tests:** 4 tests — returns 403 without key, 401 without token, 200 with valid token, `/healthz` is public

**Failure:** `/healthz` returned 302 (redirect to `/login`); `/api/kill-switch/activate` returned 401 (JWT auth gate).

**Root cause:** The dashboard server had been upgraded to full JWT + subscription auth (landing page, user accounts, billing). The `/healthz` and `/api/kill-switch/activate` routes were never added to the pre-auth public section. All requests not matching explicit public routes fell through to the JWT middleware, which redirected HTML requests to `/login` and returned 401 for API paths.

**Fix:** Added two new route handlers in `DashboardServer.start()`, placed before the rate-limiter and JWT auth middleware:

- `GET /healthz` — public, no auth. Returns JSON with `{ ok, activeWallets, liveTradingEnabled, totalFeesAccrued, walletFees, uptime }`. Aggregates per-wallet fee totals via `getTotalFeesAccrued()` on each wallet.
- `POST /api/kill-switch/activate` — requires `DASHBOARD_API_KEY` environment variable. Returns 403 if the variable is unset, 401 if the `Authorization: Bearer <token>` header does not match, 200 on success. Invokes `engine.activateKillSwitch()` if the engine is running.

**File:** `src/reporting/dashboard_server.ts`

---

### 4. `tests/fee_accounting.test.ts` — `/healthz` fee fields (dashboard suite)

**Tests:** "GET /healthz returns totalFeesAccrued field", "totalFeesAccrued increases after a fill", "walletFees per-wallet fee totals included in /healthz"

**Failure:** `SyntaxError: Unexpected token '<', "<!DOCTYPE "...` — server returned an HTML page instead of JSON.

**Root cause:** Same as item 3 — `/healthz` was not a registered route, so the server returned the landing HTML page. These tests also required the `totalFeesAccrued` and `walletFees` fields to be present.

**Fix:** Resolved by the same `/healthz` handler added in fix 3. The handler iterates `walletManager.listWallets()`, calls `getTotalFeesAccrued()` on each wallet (via duck-typing to support both `PaperWallet` and `PolymarketWallet`), and returns the aggregated total plus a per-wallet breakdown.

---

### 5. `tests/e2e/paper_clob_e2e.test.ts` — Dashboard `/healthz` unreachable

**Test:** "dashboard /healthz returns ok:true with correct wallet count"  
**Failure:** `SyntaxError: Unexpected end of JSON input`

**Root cause:** Same as items 3 and 4. `/healthz` did not exist; the HTTP response body was empty or non-JSON.

**Fix:** Resolved by fix 3.

---

## Test Counts Before and After

| Metric | Before | After |
|--------|--------|-------|
| Test files failing | 4 | 0 |
| Tests failing | 10 | 0 |
| Tests passing | 234 | 244 |
| Total tests | 244 | 244 |

---

## Files Changed

| File | Change |
|------|--------|
| `src/wallets/polymarket_wallet.ts` | `applyFill()`: added `releaseReservation(cost)` before balance deduction |
| `src/storage/database.ts` | `initSchema()`: extended `_ensureColumn` migration calls to cover all structural columns of the `trades` table |
| `src/reporting/dashboard_server.ts` | Added `GET /healthz` (public) and `POST /api/kill-switch/activate` (DASHBOARD_API_KEY Bearer auth) routes before the JWT middleware |

---

## Remaining Known Issues (Not Regressions — Pre-existing Operational)

These were documented in OVERNIGHT_AUDIT_REPORT.md and POST_OVERNIGHT_FIXES.md and are not test failures:

| Issue | Status |
|-------|--------|
| `mispd_d0b28f78` wallet dead for 13+ hours (no signals) | Operational — mispricing thresholds may be too tight |
| `arb_d0b27` free cash near zero (82% capital locked) | Operational — needs `max_open_trades` cap or balance floor |
| Momentum strategy losing at 36% win rate | Operational — should be paused before live deployment |
| `ma` wallet 97% paper win rate unlikely to hold live | Operational — fill model validation needed |
| No `opened_at` timestamp on `positions` table | Schema debt — prevents age-based forced exits |
| No strategy inactivity alerting | Operational — wallets can go silent for hours without alert |
