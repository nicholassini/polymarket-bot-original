# Phase 10c — Fix Live Trading Blockers

## Context

Read `PHASE_10C_WIRING_AUDIT.md` in the project root first. It documents 2 critical blockers and 6 caveats preventing live trading. This prompt fixes all of them.

The bot is currently running in PAPER mode and must continue working in paper mode after these changes. All existing tests (244/244) must still pass. Do NOT break paper trading.

---

## BLOCKER 1: Wire OrderTracker Into The Startup Sequence

`src/execution/order_tracker.ts` is fully implemented (252 lines) but never imported, instantiated, or started anywhere. Fix this.

### Changes needed:

**File: `src/execution/trade_executor.ts`**

Currently `execute()` calls `wallet.placeOrder()` and discards the result (returns `void`). Change it to:

1. Capture the `OrderPlacementResult` from `wallet.placeOrder()`
2. If `result.status === 'submitted'` AND an `orderTracker` is available, call `orderTracker.addPendingOrder()` with the order details
3. Accept an optional `OrderTracker` dependency (constructor injection or setter method)
4. For PAPER wallets (which return `status: 'filled'` synchronously), the orderTracker path is simply skipped — no change to paper behavior

**File: `src/cli.ts` (or wherever the startup wiring lives)**

1. Import `OrderTracker` from `src/execution/order_tracker.ts`
2. Instantiate it: `const orderTracker = new OrderTracker(db, walletManager, ...)`
   - Check the OrderTracker constructor signature to pass the right args
3. Inject the orderTracker into `TradeExecutor` (however you wired step 1 above)
4. Call `orderTracker.start()` AFTER `engine.start()`
5. Call `orderTracker.stop()` in the graceful shutdown handler
6. Only create/start OrderTracker when at least one LIVE wallet exists — don't start it for paper-only runs

**File: `src/core/engine.ts` (if needed)**

If the engine creates TradeExecutor internally, it may need to accept and pass through the orderTracker reference. Check the actual wiring.

### Important constraints:
- Paper wallets return `status: 'filled'` — the orderTracker path must NOT be invoked for paper fills
- The orderTracker should only poll CLOB when there are actual pending live orders
- Don't start orderTracker if there are zero LIVE wallets (pure paper mode must work unchanged)

---

## BLOCKER 2: Fix Double-Debit Bug in Balance Accounting

**Use Option A from the audit** — it's architecturally cleaner.

**File: `src/wallets/polymarket_wallet.ts`**

Current flow in `placeOrder()`:
1. `reserveBalance(cost)` — reserves funds before CLOB call ✅ Keep this
2. CLOB fetch call ✅ Keep this  
3. On success: `releaseReservation(cost)` then `availableBalance -= cost` ❌ REMOVE the debit
4. Push trade record ✅ Keep this

Changed flow in `placeOrder()`:
1. `reserveBalance(cost)` — reserves funds before CLOB call ✅
2. CLOB fetch call ✅
3. On success: keep the reservation held (do NOT release, do NOT debit). The money stays reserved until OrderTracker confirms the fill or cancel. ✅
4. Push trade record ✅
5. On CLOB rejection (4xx): `releaseReservation(cost)` — money goes back to available ✅

Current flow in `applyFill()`:
- Debits `availableBalance -= (cost + fee)` ✅ This becomes the SOLE debit path
- Release the reservation for this order

Current flow on cancel/timeout (in OrderTracker):
- Should call `releaseReservation(cost)` on the wallet — verify this exists

**Key:** After this change:
- `reserveBalance()` locks funds at submission → prevents overspending
- `applyFill()` converts reservation to permanent debit → single debit point
- Cancel/timeout releases reservation → funds return to available
- Paper wallet is unchanged (it never calls reserveBalance/applyFill in the live sense)

### Verify these edge cases:
- Partial fill: does `applyFill()` handle filling less than the full order? Does it release the unfilled portion's reservation?
- Order timeout: does OrderTracker call `releaseReservation()` when cancelling a timed-out order?
- Bot crash and restart: if the bot crashes with a reservation held, does `orderTracker.start()` restore pending orders and their reservations from SQLite?

---

## CAVEAT FIXES (do all of these too)

### Caveat 1: Dashboard-created live wallets missing liveCfg/feeCfg

**File: `src/reporting/dashboard_server.ts`**

Find all `new PolymarketWallet(...)` calls (audit found them at lines ~905, ~1829, ~2108). Pass `this.feeCfg` and the live trading config to each one, same pattern used for PaperWallet in the Phase 10b fix. The dashboard already has `this.feeCfg` from the `setFeeCfg()` setter. Add a similar `setLiveCfg()` setter and wire it in `cli.ts`.

### Caveat 2: Reconciliation never activated

**File: `src/cli.ts`**

After creating live wallets, call `wallet.startReconciliation(300_000)` (every 5 minutes) on each LIVE wallet. Add `wallet.stopReconciliation()` to graceful shutdown.

### Caveat 3: walletAddress not parsed from config

**File: `src/core/config_loader.ts`**

Add `wallet_address?: string` to the wallet config interface. Pass it through to `PolymarketWallet` constructor so `reconcileBalance()` has an address to query. Check that `polymarket_wallet.ts` reads it from the config.

### Caveat 4: API key validation at startup

**File: `src/core/config_validator.ts`**

When live trading is enabled, add a startup check that pings the CLOB API (e.g., `GET /` or any lightweight endpoint) with the configured API key. If it fails, log an error and abort startup — don't let the bot run with bad credentials.

### Caveat 5: Silent LIVE→PAPER fallback

**File: `src/wallets/wallet_manager.ts`**

The current behavior (LIVE wallet silently falls back to PAPER when live trading is disabled) is safe but too quiet. Change the `logger.warn` to `logger.error` and add a console.log so it's impossible to miss. Do NOT change the behavior (still fall back to PAPER), just make the warning louder.

---

## Testing Requirements

### New tests needed:

1. **OrderTracker wiring test**: Verify that when TradeExecutor gets a `'submitted'` result from a live wallet, it calls `orderTracker.addPendingOrder()`
2. **OrderTracker skip for paper**: Verify that when TradeExecutor gets a `'filled'` result from a paper wallet, it does NOT call orderTracker
3. **Double-debit prevention test**: Submit a live order → verify balance is reserved (not debited) → call applyFill() → verify balance is debited exactly once
4. **Cancel reservation release test**: Submit a live order → verify reservation held → cancel/timeout → verify reservation released, balance restored
5. **Partial fill test**: Submit a live order for 10 shares → applyFill() for 6 shares → verify 6 shares debited, 4 shares' reservation released
6. **Reconciliation activation test**: Verify startReconciliation is called for LIVE wallets and NOT for PAPER wallets
7. **API key validation test**: Verify startup aborts if CLOB ping fails when live trading is enabled
8. **Dashboard live wallet args test**: Verify dashboard-created PolymarketWallet instances receive liveCfg and feeCfg

### Existing tests:
- Run `npm test` and confirm all 244 existing tests still pass
- Run `npx tsc --noEmit` and confirm zero TypeScript errors

---

## Output

After all changes:
1. Run `npx tsc --noEmit` — must be clean
2. Run `npm test` — all existing + new tests must pass
3. Write a summary of every file changed, what was changed, and why
4. Note any design decisions you made that weren't specified above
5. List any concerns or edge cases that need manual verification
