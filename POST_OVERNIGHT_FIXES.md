# Post-Overnight Fixes — 2026-04-10

Generated at: 2026-04-10T01:20 UTC  
Bot status: **RUNNING — not stopped**

---

## 1. Wallet Activity Table

Query timestamp: 2026-04-10T01:11 UTC

| Wallet | Last Trade | Trades (1hr) | Trades (3hr) | Free Cash ($) | Open Positions | Verdict |
|--------|-----------|-------------|-------------|---------------|---------------|---------|
| user_d0b27 | 01:00 UTC (0.22h ago) | 232 | 1,198 | $911.21 | 5 | **ACTIVELY TRADING** |
| ma | 01:11 UTC (0.00h ago) | 2,634 | 8,050 | $149.76 | 137 | **ACTIVELY TRADING** |
| arb_d0b27 | 01:10 UTC (0.00h ago) | 1,166 | 3,716 | **-$179.28** | 74 | **ACTIVELY TRADING** (cash-starved) |
| ai_d0b28f78 | 01:10 UTC (0.01h ago) | 185 | 455 | $169.91 | 8 | **ACTIVELY TRADING** |
| highprob_d0b28f78 | 23:22 UTC (1.80h ago) | 0 | 3 | $35.70 | 4 | **SLOW BUT ALIVE** |
| mispd_d0b28f78 | 11:52 UTC (13.31h ago) | 0 | 0 | $78.89 | 9 | **DEAD** |
| momentum_d0b28f78 | 01:09 UTC (0.03h ago) | 66 | 258 | $16.02 | 12 | **ACTIVELY TRADING** |

### Key Findings

- **arb_d0b27**: Exposure ($226.92) exceeds balance ($47.49). Free cash is effectively negative. The wallet is still placing trades because the strategy uses open positions for round-trip logic, but new BUY capacity is near zero. The 74 open positions are locking 82% of effective capital. **Recommendation: cap `max_open_trades` for this wallet or add a free-cash floor check before placing new BUY orders.**

- **mispd_d0b28f78**: Last trade was 13.3 hours ago. 9 open positions, $5.35 exposure, $84.24 balance. The strategy has clearly stalled — likely no signals generated (mispricing is thin to find). The balance is healthy so it is not capital-starved; the strategy itself is not firing. **Recommendation: check mispricing thresholds or add a health alert for strategies with no trades in >6h.**

- **highprob_d0b28f78**: Only 3 trades in the last 3 hours. Strategy generates sparse signals by design (filtered convergence). Total of 67 trades over 13.7 hours = ~5/hour. Low but intentional.

---

## 2. Zero-Cost Trade Analysis

### Finding

The database contained **1,325 trades** with `size = 0` AND `cost = 0`. These are phantom records.

| Wallet | Zero-Cost Trades |
|--------|-----------------|
| paper_ai_forecast | 706 |
| ai_d0b28f78 | 612 |
| wallet_2 | 7 |
| **Total** | **1,325** |

**Pattern**: All phantom trades have exactly `size=0, cost=0, realized_pnl=0`. They appear consistently spread across the full run (from 11:00 UTC to 01:00 UTC the next day), not clustered at startup. They are exclusively `SELL` orders on markets where no prior position existed — the `applyFill()` path in `paper_wallet.ts` returns a phantom position with `size=0` for naked sells, and the `placeOrder()` method was calculating `cost = price * 0 = 0` and still persisting the record.

**Root cause**: Strategies were generating SELL signals on markets where the wallet held no position (or had already fully closed). The fill simulator accepted `size=0` and returned a fill, which was then persisted with zero cost.

### Fix Applied

**`src/wallets/paper_wallet.ts` — `placeOrder()`**: Added a guard that returns early (with a `logger.warn`) if `request.size <= 0`. The fill simulator is never called for zero-size orders.

**`src/storage/trading_db.ts` — `saveTrade()`**: Added a second-layer defense that rejects any record with `size <= 0 OR cost <= 0` before insert, logging a warning with the wallet/market/order context for tracing.

These are defense-in-depth: the `placeOrder` guard prevents the fill from happening; the `saveTrade` guard prevents persistence of any zero-cost record that might slip through other code paths.

### Tests

New test file: `tests/zero_cost_trade_guard.test.ts` — 11 tests, all passing.

---

## 3. Fee Column Migration

### Finding

The `trades` table was missing `fee_amount` and `fee_rate` columns. The Phase 9 migration was never applied because the `migrate()` function in `trading_db.ts` used `CREATE TABLE IF NOT EXISTS` — which is idempotent and skips when the table already exists — and included no `ALTER TABLE` statements to add the new columns to existing databases.

SQLite schema before fix:
```
CREATE TABLE trades (
  id, order_id, wallet_id, market_id, outcome, side,
  price, size, cost, realized_pnl, cumulative_pnl, balance_after, timestamp
)
```
No `fee_amount` or `fee_rate` columns.

### Fix Applied

**`src/storage/trading_db.ts` — `migrate()`**: After the `CREATE TABLE IF NOT EXISTS` block, the migration now reads `PRAGMA table_info(trades)` to get current column names, then conditionally runs `ALTER TABLE trades ADD COLUMN fee_amount REAL NOT NULL DEFAULT 0` and `ALTER TABLE trades ADD COLUMN fee_rate REAL NOT NULL DEFAULT 0` only when the columns are absent. This is safe to run on both new and existing databases.

**`src/storage/trading_db.ts` — `prepareStatements()`**: Updated `_insertTrade` to include `fee_amount` and `fee_rate` in the INSERT.

**`src/storage/trading_db.ts` — `saveTrade()`**: Spreads `{ feeAmount: 0, feeRate: 0, ...trade }` so existing callers without fee fields don't throw `Missing named parameter`.

**`src/storage/trading_db.ts` — `loadTrades()`**: Updated SELECT to include `fee_amount, fee_rate` and maps them to `feeAmount`/`feeRate` on the returned `TradeRecord`.

**`src/wallets/paper_wallet.ts`**: Paper wallet now sets `feeAmount: 0, feeRate: 0` on `tradeRecord`. Live fee tracking is a future Phase 10 item.

**`src/types.ts`**: Added optional `feeAmount?: number` and `feeRate?: number` to `TradeRecord`.

**Status after fix**: The live database (`data/trading.db`) will receive the migration on next bot restart. Existing rows will show `fee_amount = 0, fee_rate = 0` (SQLite DEFAULT applies retroactively to the column, but not to existing rows — existing rows will have NULL which coalesces to 0 in `loadTrades`).

---

## 4. Position Accumulation Report

| Wallet | Open Positions | Exposure ($) | Balance ($) | Capital Locked % | Runtime (h) | Verdict |
|--------|---------------|-------------|------------|-----------------|------------|---------|
| user_d0b27 | 5 | $3.23 | $915.26 | 0% | 13.6 | Healthy |
| ma | 137 | $328.32 | $489.68 | 40% | 13.6 | Accumulating |
| arb_d0b27 | 74 | $226.92 | $48.58 | **82%** | 13.7 | Capital-starved |
| ai_d0b28f78 | 8 | $2.79 | $172.54 | 2% | 13.2 | Healthy |
| highprob_d0b28f78 | 4 | $7.39 | $43.09 | 15% | 13.7 | Healthy |
| mispd_d0b28f78 | 9 | $5.35 | $84.24 | 6% | 13.7 | Stalled (see §1) |
| momentum_d0b28f78 | 12 | $14.62 | $30.90 | 32% | 13.6 | Elevated |

**Position timestamps**: The `positions` table has no `opened_at` timestamp column, so exact age per position is not derivable. The positions are "open" in the sense that `size > 0` in the table — they are updated in-place on each partial close. Average hold time cannot be computed without schema changes.

**Are positions being closed?** Yes. SELL trade counts vs BUY trade counts are nearly balanced for most wallets (e.g. `ma`: 18,783 BUY / 18,608 SELL), indicating positions are being opened and closed. However the net open count (137 for `ma`, 74 for `arb_d0b27`) is high, suggesting positions accumulate faster than they resolve in paper trading because no market resolves to 0 or 1 (it's all simulation).

**Concern — arb_d0b27**: 82% of effective capital locked. BUY orders will be constrained. Strategy may start failing to size up new opportunities.

---

## 5. Recommendations (Prioritized)

### P0 — Immediate
1. **Monitor `arb_d0b27`** closely. Its free cash is near zero with 74 open positions holding $227 exposure. If the strategy tries to BUY and `availableBalance < cost`, orders will be placed but the balance will go negative (no balance check in `placeOrder`). Consider adding a pre-flight balance check: `if (request.size * request.price > this.state.availableBalance) return;`

2. **Investigate `mispd_d0b28f78`** — DEAD for 13+ hours. Check the mispricing strategy's signal generation threshold. If it's never firing, either the thresholds are too tight or markets are too efficient. Consider lowering the mispricing detection edge or pausing the wallet to free up the allocated $100 capital.

### P1 — Before next run
3. **Add balance floor guard in `placeOrder`**: Prevent buys when `availableBalance < cost`. Currently nothing blocks a buy when the wallet is broke — it would record a negative `balanceAfter`.

4. **Add position timestamp to schema**: Add `opened_at INTEGER` to the `positions` table so position age can be tracked. This enables forced time-based exits (e.g. close any position open > 24h).

5. **Alert on strategy inactivity**: Log a WARNING (or send a notification) when a wallet goes >2h with no new trades. `mispd_d0b28f78` was DEAD for 13h with no alert.

### P2 — Housekeeping
6. **Zero-cost trades already fixed** (see §2). No backfill needed — the 1,325 phantom records have `realized_pnl=0` and `cost=0` so they did not distort PnL figures materially.

7. **Fee columns now present** (see §3). Wire up actual fee rates from `config.yaml` into `paper_wallet.ts` when fee simulation is ready.

8. **`ma` strategy accumulation**: 137 open positions at 40% capital locked is not an emergency but warrants a `max_open_trades` ceiling. The market-making strategy benefits from many small positions, but uncapped accumulation will eventually exhaust balance.

---

## Test Results

```
Test Files:  7 failed (pre-existing) | 10 passed (17 total)
Tests:       67 failed (pre-existing) | 177 passed (244 total)
New tests added: 11 (zero_cost_trade_guard.test.ts) — all passing
```

Pre-existing failures are in `fee_accounting.test.ts`, `database.test.ts`, `dashboard_auth.test.ts`, `e2e/`, and others — these reference API surfaces (`FeeConfig`, `getTotalFeesAccrued`, `initSchema`) that are not yet implemented. These failures pre-date this fix (77 tests failed before, 67 after — net improvement of 10 tests fixed by my changes).
