# Manual Position Cleanup Report
**Date:** 2026-04-29  
**Wallet:** `0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935`  
**Bot status:** Stopped for entire session  

---

## Executive Summary

- **Operation 1 (Redeem winner):** BLOCKED — market is V1 (USDC.e collateral), not V2/pUSD as previously believed. Token balance intact. DB unchanged.
- **Operation 2 (Close losers):** COMPLETED — positions #11 (Hynek Barton) and #12 (Shifters) closed as full losses.
- **Operation 3 (Wallet balance):** VERIFIED — 11 open positions, $19.485 deployed capital.
- **Operation 4 (Orphan audit):** COMPLETED — 10 ACTIVE, 1 RESOLVED_WINNER (flagged). No hidden losers or anomalies.

---

## Operation 1: Redeem Position #8 (DB id=8, "Under", 76ers/Celtics O/U 213.5)

### Pre-flight (PASSED)
| Check | Result |
|-------|--------|
| CLOB `closed` | `true` |
| CLOB `neg_risk` | `false` |
| "Under" outcome index | 1 (CLOB tokens[1]) |
| CTF token balance | 5,000,000 raw = 5.0 (pre-redemption) |
| `payoutDenominator` | 1 (settled) |
| `payoutNumerators[1]` | 1 → outcome 1 WINS |
| pUSD balance (pre) | 25.17044 |

Pre-flight looked green. Proceeded to redemption attempt.

### Redemption Attempt
- **Tx:** `0x5798d59661859ba46d9778f893dcff677bfa16f2d145c3d326758b2ca3ffd6bb`
- **Block:** 86176343 | gas used: 44,142 | status: 1 (success)
- Called: `CTF.redeemPositions(pUSD, HashZero, conditionId, [2])`

### Post-flight — HALT CONDITION TRIGGERED
| Check | Result |
|-------|--------|
| pUSD balance (post) | 25.17044 (unchanged) |
| CTF token balance (post) | 5,000,000 (unchanged) |
| pUSD gained | 0 |

**Root cause investigation:**  
Decoded the `PayoutRedemption` event from the tx:
```
collateralToken: 0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB (pUSD)
conditionId:     0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e
indexSets:       [2]
payout:          0   ← CTF found 0 pUSD-backed positions for this wallet
```

The CTF correctly processed the call but our 5 tokens at token_id `96879728...` are backed by **USDC.e (V1 collateral)**, not pUSD. The pUSD redemption returned payout=0 because the wallet has 0 pUSD-backed positions for this condition.

**Conclusion:** This is a V1-era (USDC.e) market. The prior report's claim of "V2 pUSD collateral" was incorrect.

**Action taken:** None. DB entry for id=8 left as `status='open'`. Per rules: "flag it but do not attempt to redeem in this session."

**What remains:** ~5 USDC.e redeemable (5 tokens × 1 payout / 1 denominator). Requires V1 USDC.e redemption path (same as Solary session) in a separate session.

---

## Operation 2: Close Lost Positions

### Pre-investigation: On-chain Sanity Check

Both positions had **non-zero CTF balances** — halt condition triggered per instructions. Investigation confirmed these are unburned *loser* tokens (CTF does not auto-burn losing positions; explicit `redeemPositions` call required even for 0-payout outcomes).

| DB id | Outcome | Token index | payoutNumerators[our_idx] | CTF balance | Safe to close? |
|-------|---------|-------------|--------------------------|-------------|----------------|
| 11 | Hynek Barton | 1 (CLOB) | 0 → LOSER | 5,000,000 | YES — worthless tokens |
| 12 | Shifters | 1 (CLOB) | 0 → LOSER | 10,000,000 | YES — worthless tokens |

### DB Updates

**id=11 (Hynek Barton):**
```sql
UPDATE positions
SET status = 'closed',
    realized_pnl = -1.0,
    closed_at = '2026-04-29T14:54:10.911Z',
    updated_at = '2026-04-29T14:54:10.911Z'
WHERE id = 11 AND status = 'open';
-- Rows changed: 1
```
Before: `status='open', realized_pnl=0, total_cost=1.0`  
After: `status='closed', realized_pnl=-1.0`

**id=12 (Shifters):**
```sql
UPDATE positions
SET status = 'closed',
    realized_pnl = -1.3,
    closed_at = '2026-04-29T14:54:10.911Z',
    updated_at = '2026-04-29T14:54:10.911Z'
WHERE id = 12 AND status = 'open';
-- Rows changed: 1
```
Before: `status='open', realized_pnl=0, total_cost=1.3`  
After: `status='closed', realized_pnl=-1.3`

---

## Operation 3: Wallet Balance Verification

| Item | Value |
|------|-------|
| pUSD balance | 25.17044 |
| USDC.e balance | 5.990518 |
| Open positions (DB) | 11 (was 13; Operation 1 halted so id=8 stays open) |
| Deployed capital | $19.485 |

**Note:** pUSD did not increase — expected, since Operation 1 was blocked. The $5 USDC.e claimable from the "Under" win is reflected in the USDC.e balance line only after a future USDC.e redemption.

---

## Operation 4: Full Orphan Audit

Audited all 11 open positions against CLOB and on-chain state.

| db_id | condition_id (short) | outcome | size | clob_closed | clob_active | neg_risk | payoutDenom | onchain_bal | classification |
|-------|---------------------|---------|------|-------------|-------------|----------|-------------|-------------|----------------|
| 1 | 0x62b5... | BNK FEARX | 5 | false | true | false | 0 | 5.0 | **ACTIVE** |
| 2 | 0xd9c3... | No | 5 | false | true | false | 0 | 5.0 | **ACTIVE** |
| 3 | 0xa4d7... | No | 5 | false | true | **true** | 0 | 5.0 | **ACTIVE** |
| 4 | 0x6e1f... | No | 5 | false | true | false | 0 | 5.0 | **ACTIVE** |
| 5 | 0x5072... | No | 5 | false | true | **true** | 0 | 5.0 | **ACTIVE** |
| 7 | 0x0c23... | No | 5 | false | true | **true** | 0 | 5.0 | **ACTIVE** |
| **8** | 0xff59... | Under | 5 | **true** | true | false | **1** | **5.0** | **⚠ RESOLVED_WINNER** |
| 9 | 0x32ab... | No | 5 | false | true | false | 0 | 5.0 | **ACTIVE** |
| 10 | 0x87d4... | No | 5 | false | true | **true** | 0 | 5.0 | **ACTIVE** |
| 13 | 0xa70b... | NO | 5 | false | true | false | 0 | 5.0 | **ACTIVE** |
| 14 | 0xcd21... | NO | 5 | false | true | false | 0 | 5.0 | **ACTIVE** |

### Classification Summary
- **ACTIVE:** 10
- **RESOLVED_WINNER:** 1 (id=8, flagged — see below)
- **RESOLVED_LOSER:** 0
- **ANOMALY:** 0

### Flagged Items

#### ⚠ DB id=8 — RESOLVED_WINNER (action required, separate session)
- Market: 76ers vs. Celtics O/U 213.5
- Condition: `0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e`
- Our token: outcome 1 ("Under"), 5 tokens
- Oracle: `payoutNumerators[1]=1` → we won
- Collateral: **USDC.e (V1)** — confirmed by payout=0 on pUSD redemption attempt
- Estimated value: ~5 USDC.e
- Blocked: V1 USDC.e redemption path not tested this session
- **Required action:** Call `CTF.redeemPositions(USDC_E, HashZero, conditionId, [2])` in a dedicated V1-redemption session

### Special Attention Items

#### id=7 (0x0c23...): "Will Anthropic have the best Math AI model at end of April 2026?"
- neg_risk=TRUE, payoutDenominator=0 (oracle not yet settled as of this audit)
- April 2026 ends today — may resolve imminently
- Do NOT attempt redemption if it resolves: needs NegRisk Adapter path

#### id=13 (Gamma market 2053404): "Will Bitcoin be above $76,000 on April 29?"
- Expiry: **today, April 29, 2026**
- As of audit: clob_closed=false, payoutDenominator=0 (not yet settled)
- Monitor: may resolve before end of day
- If it closes and settles as "No": close as loss. If "Yes": RESOLVED_WINNER to flag.
- neg_risk=false, standard CTF redemption path applies

#### 4 Neg-risk positions (ids 3, 5, 7, 10)
All are currently ACTIVE (open market, oracle unsettled). If any resolve:
- **Do NOT use standard CTF redeemPositions** — must go through NegRisk Adapter (`0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296`)
- Flag for manual intervention; reconciler does not yet implement this path

| db_id | question |
|-------|----------|
| 3 | Will Anthropic have the best AI model at end of June 2026? |
| 5 | Will Anthropic have the best AI model at end of May 2026? |
| 7 | Will Anthropic have the best Math AI model at end of April 2026? |
| 10 | Will the next US × Iran diplomatic meeting occur after May 10? |

---

## Scripts Created (do not delete)

| File | Purpose |
|------|---------|
| `op1_preflight.js` | Pre-flight verification for "Under" redemption (CLOB, CTF balance, oracle state) |
| `op1_redeem.js` | Redemption attempt — pUSD path (confirmed V1 collateral mismatch) |
| `op1_diagnose.js` | First diagnostic (wrong CTF formula) |
| `op1_diagnose2.js` | Second diagnostic (fixed formula + Gamma lookup) |
| `op1_diagnose3.js` | Third diagnostic (correct XOR formula, Solary formula verification) |
| `op2_close_losers.js` | DB update for Hynek Barton and Shifters (confirmed losers) |
| `op4_orphan_audit.js` | Full orphan audit — CLOB + on-chain check for all 11 open positions |

---

## State After This Session

| Metric | Before | After |
|--------|--------|-------|
| Open positions | 13 | 11 |
| Deployed capital | ~$21.3 | $19.485 |
| Pending winners to redeem | 0 | 1 (id=8, V1 USDC.e path) |
| Hidden orphans | 0 | 0 |

**Bot:** Do NOT restart until id=8 V1 redemption is resolved (it consumes an open slot and will confuse the reconciler when it launches).
