# Reconciler Build Report

Generated: 2026-05-01

---

## 1. Files Created

### `src/reconciliation/collateral_detector.ts` — 56 lines
Pure on-chain module. Calls the Gnosis ConditionalTokens contract on Polygon via ethers v5
to determine whether a condition has been settled.

Key exports:
- `ResolutionStatus` — `{ resolved, payoutDenominator, noNumerator, yesNumerator }` (all bigint)
- `checkConditionResolution(conditionId, rpcUrl): Promise<ResolutionStatus>` — queries
  `payoutDenominator(bytes32)` first; only fetches `payoutNumerators` when denominator > 0 to
  minimise RPC round-trips in the common ACTIVE case.

Outcome index convention (Polymarket binary): index 0 = NO, index 1 = YES.

### `src/reconciliation/position_reconciler.ts` — 268 lines
Orchestrator class that runs one full reconcile cycle.

Key exports:
- `PositionClassification` — `'ACTIVE' | 'RESOLVED_WINNER' | 'RESOLVED_LOSER' | 'NEG_RISK_SKIP' | 'ANOMALY'`
- `ReconcilePositionResult` — per-position result with classification, payoutAmount, realizedPnl, error
- `ReconcileSummary` — full cycle summary with counts and the `positions` array
- `ReconcilerConfig` — constructor argument bag
- `PositionReconciler` — class with single public method `run(tick?): Promise<ReconcileSummary>`

Classification pipeline per position:
1. Missing `conditionId` → **ANOMALY** (cannot check on-chain)
2. Gamma API call `GET {gammaApi}/markets?condition_id={conditionId}` — if call fails or returns
   no `neg_risk` field → **ANOMALY** (safe default: never process an unknown neg-risk position)
3. `neg_risk === true` → **NEG_RISK_SKIP**
4. `checkConditionResolution` → `payoutDenominator === 0` → **ACTIVE**
5. Numerator for the position's outcome (YES=index 1, NO=index 0):
   - `> 0` → **RESOLVED_WINNER**, payout = `size × (numerator / denominator)`
   - `= 0` → **RESOLVED_LOSER**, payout = 0

Live-mode processing (skipped entirely in dry-run):
- `db.closePosition(walletId, marketId, outcome, realizedPnl)`
- `wallet.updateBalance(payoutAmount)` — credits redemption proceeds to in-memory balance

---

## 2. Files Modified

### `src/core/engine.ts`

| Location | Change |
|---|---|
| Line 11 | `import { PositionReconciler } from '../reconciliation/position_reconciler'` |
| Lines 232–233 (after `lastScanLog`) | Added `private reconcilers: PositionReconciler[] = []` and `private readonly RECONCILE_EVERY_TICKS` field |
| Lines 69–91 (in `initialize()`) | Reconciler setup block — clears array, reads `RECONCILER_DRY_RUN` / `POLYGON_RPC_URL` env vars, creates one reconciler per LIVE wallet, logs count |
| Lines 289–299 (in `tick()`, after balance snapshot block) | Reconciler tick gate: `if (tickCount % RECONCILE_EVERY_TICKS === 0 && tickCount > 0)` — runs all reconcilers, logs summary, catches errors non-fatally |

No other tick-loop logic was modified.

---

## 3. Build Status

```
$ npm run build
> tsc -p tsconfig.json
(exit 0 — zero errors, zero warnings)
```

Compiled output confirmed in `dist/reconciliation/`:
- `collateral_detector.js`
- `position_reconciler.js`

---

## 4. Confirmed Function Signatures from Existing Code

| Function | File:Line | Signature used |
|---|---|---|
| `updateBalance` | `src/wallets/polymarket_wallet.ts:151` | `updateBalance(delta: number): void` — simple delta add |
| `closePosition` (DB) | `src/storage/trades_db.ts:177` | `closePosition(walletId, marketId, outcome, realizedPnl): void` |
| `loadOpenPositions` | `src/storage/trades_db.ts:190` | `loadOpenPositions(walletId): PersistedPosition[]` |
| `getWallet` | `src/wallets/wallet_manager.ts:83` | `getWallet(walletId): ExecutionWallet \| undefined` |
| `getState().mode` | `src/types.ts:1` | `WalletState.mode: 'LIVE' \| 'PAPER'` |

The reconciler defines its own minimal `WalletRef` interface (`{ updateBalance(delta: number): void }`)
rather than importing `ExecutionWallet` directly, avoiding a module coupling that wasn't necessary.
The `ExecutionWallet` interface satisfies `WalletRef` structurally, so no cast is needed at the call site.

No modifications were made to `src/wallets/polymarket_wallet.ts`.

---

## 5. Deviations from Spec

None. All spec requirements are implemented as written:
- `RECONCILE_EVERY_TICKS = 60` default, overridable via `RECONCILE_INTERVAL_TICKS` env var
- `RECONCILER_DRY_RUN=true` default (live requires explicit `RECONCILER_DRY_RUN=false`)
- Tick-0 skip: `&& this.tickCount > 0`
- `initialize()` re-entrant: `this.reconcilers = []` clears previous instances on restart
- Structured logging: INFO at start with `{ tick, positionCount, dryRun }`, INFO per classification,
  WARN for NEG_RISK_SKIP and ANOMALY, ERROR for payout=0 on winner and processResolved failures

---

## 6. Gamma URL Audit

**Grep for `/markets?id=` (query-string ID form) in `src/`:**

```
No matches found.
```

Zero instances of the `/markets?id=` query-string form exist anywhere in `src/`. The audit suspect
mentioned in the v11 notes (`src/data/orderbook_stream.ts`) does not contain this pattern.

All Gamma API calls in `src/` use list-endpoint pagination:
```
{gammaApi}/markets?active=true&closed=false&limit=...&offset=...&order=...
```

The new reconciler uses `?condition_id=` (different parameter, confirmed working from
`op8_probe_collateral.js` line 94) — this is not the `/markets?id=` form flagged by the audit.

---

## 7. Deployment Instructions — First Dry-Run

### Pre-flight

1. Confirm build is green: `npm run build`
2. Confirm `.env` has `POLYGON_RPC_URL` set (or falls back to public node)
3. Confirm `RECONCILER_DRY_RUN` is **not** set (defaults to `true`) or explicitly set to `true`

### Start bot in dry-run mode

```bash
# Dry-run is the default — no env var needed
npm run start
```

Or explicitly:

```bash
RECONCILER_DRY_RUN=true npm run start
```

### What to watch for in logs

The first reconciler cycle fires at **tick 60** (~5 minutes after start at 5 s/tick).

Look for the following log sequence:

```jsonc
// Cycle start
{ "tick": 60, "positionCount": 10, "dryRun": true, "msg": "Reconciler: starting cycle" }

// Per-position classification (INFO for ACTIVE/WINNER/LOSER, WARN for ANOMALY/NEG_RISK_SKIP)
{ "positionId": 1, "conditionId": "0x62b52090...", "classification": "RESOLVED_WINNER" }
{ "positionId": 7, "conditionId": "0x0c234243...", "classification": "NEG_RISK_SKIP" }
{ "positionId": 13, "conditionId": "0xa70b2489...", "classification": "RESOLVED_WINNER" }

// Cycle summary
{ "summary": { "dryRun": true, "positionsChecked": 10, "active": 7,
               "resolvedWinner": 2, "negRiskSkip": 1, ... },
  "msg": "Reconciler cycle complete" }
```

### Hard gate — validate BEFORE flipping dry-run off

Confirm from the first cycle's logs:

| Position | conditionId | Required classification |
|---|---|---|
| id=1 | `0x62b52090…` (BNK FEARX, neg_risk=FALSE) | `RESOLVED_WINNER` or `RESOLVED_LOSER` |
| id=7 | `0x0c234243…` (Anthropic Math AI April, neg_risk=TRUE) | `NEG_RISK_SKIP` |
| id=13 | `0xa70b2489…` (BTC > $76k Apr 29, neg_risk=FALSE) | `RESOLVED_WINNER` or `RESOLVED_LOSER` |

**Failure conditions (do NOT go live if any of these are true):**

- id=1 or id=13 classifies as `ACTIVE` → resolution check (CTF payoutDenominator call) is broken
- id=7 classifies as anything other than `NEG_RISK_SKIP` → neg-risk check broken or ordering wrong
- Any of the three classifies as `ANOMALY` → debug the error field before proceeding
- Any `"classification": "ERROR"` appears in logs → do not go live

Also confirm:
- Zero `UPDATE` or `INSERT` DB changes (snapshot DB file size before/after — in dry-run no writes occur)
- Zero on-chain transactions from the wallet address on Polygonscan

### Going live

Once the pinned expectation passes and zero writes/txs confirmed:

```bash
RECONCILER_DRY_RUN=false npm run start
```

After the first live cycle verify:
- `status='closed'` for id=1 and id=13 in the positions table
- Correct `realized_pnl` values (winner: `size - totalCost`; loser: `-totalCost`)
- id=7 still `status='open'` (NEG_RISK_SKIP does not close)
- Wallet's `availableBalance` increased by the payout amounts for any winners

---

## 8. Pinned Validation Expectation (OPERATOR COPY)

**The first dry-run reconciler cycle MUST produce these three classifications.
Do not flip `RECONCILER_DRY_RUN=false` until all three are confirmed.**

| DB id | Condition ID | Market | neg_risk | Required classification |
|---|---|---|---|---|
| 1 | `0x62b52090…` | BNK FEARX, 5 units | FALSE | `RESOLVED_WINNER` or `RESOLVED_LOSER` |
| 7 | `0x0c234243…` | Anthropic Math AI April, 5 units | TRUE | `NEG_RISK_SKIP` |
| 13 | `0xa70b2489…` | BTC > $76k Apr 29, 5 units | FALSE | `RESOLVED_WINNER` or `RESOLVED_LOSER` |

The remaining 7 positions should classify as `ACTIVE`.
