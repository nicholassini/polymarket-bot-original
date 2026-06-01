# op8-usdce-redemption.md — Position #8 Redemption Report

**Date:** 2026-04-29  
**Wallet:** `0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935`  
**Outcome:** SUCCESS — 5.0 USDC.e redeemed, $2.55 profit, DB closed.

---

## Step 1 — DB Row (id=8)

Read from `.runtime/trades.db` in read-only mode.

| Field | Value |
|---|---|
| id | 8 |
| wallet_id | live_user_defined_1 |
| market_id | `0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e` |
| token_id | `96879728524724829206778105208231612105108933371818952028537619813955011537087` |
| condition_id | null (hardcoded value used) |
| outcome | Under |
| side | BUY |
| size | 5 |
| avg_price | 0.49 |
| total_cost | 2.45 |
| realized_pnl | 0 (pre-close) |
| status | **open** ✔ |
| opened_at | 2026-04-28T21:23:32.090Z |

**Note:** DB `condition_id` is null; the hardcoded condition ID `0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e` was used throughout.

---

## Step 2 — CLOB Market Fetch

`GET https://clob.polymarket.com/markets/0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e`

- **Market:** "Russia-Ukraine Ceasefire before GTA VI?" (from Gamma API)
- `closed`: true
- `active`: true
- `neg_risk`: false
- Tokens array:

| Index | Outcome | token_id |
|---|---|---|
| 0 | Over | `70282683312689371376704559704512932293596800698397425757534102649103607780278` |
| 1 | **Under** | `96879728524724829206778105208231612105108933371818952028537619813955011537087` ← **OUR TOKEN** |

- DB token_id matched CLOB index **1** (outcome "Under") ✔  
- CLOB outcome matches DB outcome ✔  
- **Derived:** `outcomeIndex = 1`, `indexSet = 2`

---

## Step 3 — On-Chain CTF Token Balance

`CTF.balanceOf(0x713Df3...8935, tokenId)`  
**Source:** RPC call, block ~86,139,231 (pre-tx)

- Raw balance: **5,000,000**
- Human (6 decimals): **5.0**
- Expected ~5,000,000 ✔ (within 2%)

---

## Step 4 — Oracle Settlement State

`CTF.payoutDenominator(conditionId)`, `CTF.payoutNumerators(conditionId, 0/1)`  
**Source:** RPC read, same block

| Field | Value |
|---|---|
| payoutDenominator | **1** (settled ✔) |
| payoutNumerators[0] | 0 (Over — loser) |
| payoutNumerators[1] | **1** (Under — **WINNER** ✔) |

Our outcome index 1 has numerator > 0 → we won.

---

## Step 2.1 — Pre-Redemption Collateral Baselines

| Token | Raw | Human |
|---|---|---|
| pUSD | 25,170,440 | 25.17044 pUSD |
| USDC.e | 5,990,518 | 5.990518 USDC.e |

---

## Step 2.2 — Collateral Type Probe

**Problem:** The primary RPC (`polygon-bor-rpc.publicnode.com`) is a pruned node (error -32701) and cannot serve `eth_getLogs` for blocks from May 2025 (market creation ~block 72M). All historical log scans were rejected.

**Resolution — Strategy A (trades table → tx receipt):**

The `trades` table contained one record for this market:
- `tx_hash = 0xf51c1ac607244a784150698c2652211b6aee0398b66b061a72c89271edacdc7d`
- `timestamp = 2026-04-28T21:23:32.090Z` (block 86,139,231 — within pruned node's range)

Receipt fetched from primary RPC (recent enough to not be pruned). The receipt logs (20 total) included:

**`PositionSplit` event from CTF contract:**
- `collateralToken = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` **(USDC.e)**
- `conditionId` matched `0xff599a51...`

**Supporting ERC-20 Transfer evidence in the same receipt:**
1. pUSD Transfer: wallet → exchange (payment in pUSD)
2. USDC.e Transfer: exchange → CTF contract (split collateral is USDC.e)
3. PositionSplit: CTF emits with `collateralToken = USDC.e`

This is the positive on-chain confirmation required. The CTF `PositionSplit` event in tx `0xf51c1ac...` proves USDC.e was the collateral used when these tokens were minted.

**Verdict: USDC.e confirmed. Halt conditions not triggered.**

---

## Step 3 — Redemption Transaction

Called: `CTF.redeemPositions(USDC.e, HashZero, conditionId, [2])`

| Field | Value |
|---|---|
| TX hash | `0x10431974934bbeb90e86c49fb7a7d6e4126b83eb37e0b0f4d37676e7d99f70b1` |
| Block | 86,182,430 |
| Gas used | 73,612 |
| Status | **SUCCESS** |

**`PayoutRedemption` event decoded from receipt:**

| Field | Value |
|---|---|
| redeemer | `0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935` |
| collateralToken | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` (USDC.e) |
| parentCollectionId | `0x000...0` (HashZero) |
| conditionId | `0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e` |
| indexSets | `[2]` |
| **payout** | **5,000,000 raw = 5.0 USDC.e** |

payout > 0 ✔ — no halt triggered.

---

## Step 4 — Post-Flight Verification

| Check | Pre | Post | Delta | Pass |
|---|---|---|---|---|
| USDC.e (raw) | 5,990,518 | 10,990,518 | **+5,000,000** | ✔ |
| pUSD (raw) | 25,170,440 | 25,170,440 | 0 (unchanged) | ✔ |
| CTF balance | 5,000,000 | **0** | −5,000,000 | ✔ |

All three post-flight checks passed.

**PnL computation:**
- USDC.e received: 5.000000 USDC.e = $5.00
- total_cost (DB): $2.45
- **realized_pnl = $5.00 − $2.45 = $2.55**

---

## Step 5 — DB Close

```sql
UPDATE positions
SET status       = 'closed',
    realized_pnl = 2.55,
    closed_at    = '2026-04-29T17:48:27.954Z',
    updated_at   = '2026-04-29T17:48:27.954Z'
WHERE id = 8 AND status = 'open';
-- Rows changed: 1
```

| Field | Before | After |
|---|---|---|
| status | open | **closed** |
| realized_pnl | 0 | **2.55** |
| closed_at | null | 2026-04-29T17:48:27.954Z |

Exactly 1 row changed ✔

---

## Summary

| Item | Value |
|---|---|
| Position | id=8, "Under" on Russia-Ukraine Ceasefire before GTA VI? |
| Collateral confirmed via | PositionSplit event in tx `0xf51c1ac...` (block 86,139,231) |
| Redemption tx | `0x10431974934bbeb90e86c49fb7a7d6e4126b83eb37e0b0f4d37676e7d99f70b1` |
| Redemption block | 86,182,430 |
| Payout | 5.0 USDC.e |
| Cost | $2.45 |
| **Realized PnL** | **$2.55 (+104%)** |
| DB status | closed |

---

## Flags / Notes

1. **DB condition_id is null** for id=8. The conditionId was hardcoded from the task brief. The market_id column matches the conditionId, but the condition_id column was never populated. This is a schema population bug in the bot — `condition_id` should be written at order fill time.

2. **Prior report's pUSD failure explained:** The original purchase tx shows pUSD flowing from the wallet → exchange, which converts it to USDC.e before calling `CTF.splitPosition`. So pUSD is the user-facing payment currency, but USDC.e is the CTF collateral. Calling `redeemPositions` with pUSD would fail (payout=0 or revert) because the CTF position was split with USDC.e. The collateral must match what was used in `splitPosition`.

3. **Pruned RPC limitation:** The publicnode.com RPC prunes historical state and cannot serve eth_getLogs for blocks older than ~recent days. For future operations, archive node access (Alchemy, QuickNode, Infura) would be needed for historical log scans. The workaround (fetching the fill tx receipt directly, which was recent enough to be available) succeeded here.
