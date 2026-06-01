# Reconciler Redemption Patch

---

## Task 1: Verification

### Code block — live RESOLVED_WINNER branch (current code)

**Branch dispatch in `run()` — `src/reconciliation/position_reconciler.ts` lines 150–162:**

```typescript
if (!this.dryRun) {
  if (result.classification === 'RESOLVED_WINNER') {
    redemptionsAttempted++;
    const redeemResult = await this.redeemWinner(pos, result);
    if (redeemResult.succeeded) {
      redemptionsSucceeded++;
      capitalRecovered += redeemResult.payoutInDollars;
      totalPayoutProcessed += redeemResult.payoutInDollars;
    }
  } else if (result.classification === 'RESOLVED_LOSER') {
    this.closeLoser(pos, result);
  }
}
```

**`redeemWinner()` — lines 296–498 (full method):**

```typescript
private async redeemWinner(
  pos: PersistedPosition,
  result: ReconcilePositionResult,
): Promise<{ succeeded: boolean; payoutInDollars: number }> {
  const db = getTradesDB();

  // 1. Look up the original trade tx_hash for PositionSplit event detection
  const txHash = db.getLatestTxHash(this.walletId, pos.marketId, pos.outcome);
  if (!txHash) {
    logger.error(
      { positionId: result.positionId, conditionId: result.conditionId, marketId: pos.marketId, outcome: pos.outcome },
      'Reconciler: no tx_hash in trades table — cannot detect collateral token',
    );
    result.error = 'no tx_hash in trades — cannot detect collateral token';
    return { succeeded: false, payoutInDollars: 0 };
  }

  // 2. Detect collateral token from the PositionSplit event in the original buy tx
  let detection: CollateralDetectionResult;
  try {
    detection = await detectCollateralToken(
      this.rpcUrl,
      this.archiveRpcUrl,
      pos.conditionId!,
      txHash,
      CTF_ADDRESS,
    );
  } catch (err) {
    logger.error(
      { positionId: result.positionId, conditionId: result.conditionId, txHash, err: String(err) },
      'Reconciler: detectCollateralToken threw',
    );
    result.error = `detectCollateralToken error: ${String(err)}`;
    return { succeeded: false, payoutInDollars: 0 };
  }

  if (!detection.collateralToken) {
    logger.error(
      { positionId: result.positionId, conditionId: result.conditionId, txHash },
      'Reconciler: collateral token not detected from PositionSplit event — manual handling required',
    );
    result.error = 'collateral token not detected from PositionSplit event';
    return { succeeded: false, payoutInDollars: 0 };
  }

  // 3. indexSet: YES=outcomeIndex 1 → indexSet 2, NO=outcomeIndex 0 → indexSet 1
  const outcomeIndex = pos.outcome.toUpperCase() === 'YES' ? 1 : 0;
  const indexSet = 1 << outcomeIndex;

  // 4. Read pre-redemption collateral balance
  if (!this.wallet.getSigner) {
    logger.error(
      { positionId: result.positionId },
      'Reconciler: wallet does not implement getSigner() — cannot submit on-chain redemption',
    );
    result.error = 'wallet does not implement getSigner()';
    return { succeeded: false, payoutInDollars: 0 };
  }
  const signer = this.wallet.getSigner();
  const collateral = new ethers.Contract(detection.collateralToken, ERC20_ABI, signer);
  const walletAddress = await signer.getAddress();

  let preBalance: any;
  try {
    preBalance = await collateral.balanceOf(walletAddress);
  } catch (err) {
    logger.error(
      { positionId: result.positionId, collateralToken: detection.collateralToken, err: String(err) },
      'Reconciler: pre-redemption balance read failed',
    );
    result.error = `pre-balance read failed: ${String(err)}`;
    return { succeeded: false, payoutInDollars: 0 };
  }

  // 5. Submit redemption tx
  const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, signer);
  let tx: any;
  try {
    tx = await ctf.redeemPositions(
      detection.collateralToken,
      ethers.constants.HashZero,
      pos.conditionId!,
      [indexSet],
      { maxPriorityFeePerGas: MAX_PRIORITY_FEE, maxFeePerGas: MAX_FEE },
    );
  } catch (err) {
    logger.error(
      { positionId: result.positionId, conditionId: result.conditionId,
        collateralToken: detection.collateralToken, indexSet, err: String(err) },
      'Reconciler: redeemPositions call failed',
    );
    result.error = `redeemPositions call failed: ${String(err)}`;
    return { succeeded: false, payoutInDollars: 0 };
  }

  logger.info(
    { positionId: result.positionId, txHash: tx.hash as string },
    'Reconciler: redemption tx submitted — waiting for receipt',
  );

  let receipt: any;
  try {
    receipt = await tx.wait(1);
  } catch (err) {
    logger.error(
      { positionId: result.positionId, txHash: tx.hash as string, err: String(err) },
      'Reconciler: redemption tx reverted or wait failed',
    );
    result.error = `tx wait failed: ${String(err)}`;
    return { succeeded: false, payoutInDollars: 0 };
  }

  // Halt: tx reverted on-chain
  if ((receipt.status as number) !== 1) {
    logger.error(
      { positionId: result.positionId, txHash: tx.hash as string },
      'Reconciler: redemption tx reverted on-chain — DB and balance NOT updated',
    );
    result.error = `redemption tx reverted: ${tx.hash as string}`;
    return { succeeded: false, payoutInDollars: 0 };
  }

  // 6. Parse PayoutRedemption event from receipt
  let payout: any = null;
  for (const log of (receipt.logs as any[])) {
    try {
      const parsed = PAYOUT_REDEMPTION_IFACE.parseLog(log as { topics: string[]; data: string });
      if (parsed.name === 'PayoutRedemption') {
        payout = parsed.args.payout;
        break;
      }
    } catch { /* not this event */ }
  }

  if (!payout) {
    logger.error(
      { positionId: result.positionId, txHash: tx.hash as string,
        logsCount: (receipt.logs as any[]).length },
      'Reconciler: no PayoutRedemption event in receipt — DB and balance NOT updated',
    );
    result.error = `no PayoutRedemption event in receipt ${tx.hash as string}`;
    return { succeeded: false, payoutInDollars: 0 };
  }

  // Halt: payout is zero (wrong collateral, wrong indexSet, or already redeemed)
  if ((payout as ethers.BigNumber).eq(0)) {
    const postBal: any = await collateral.balanceOf(walletAddress);
    logger.error(
      { positionId: result.positionId, collateralToken: detection.collateralToken,
        indexSet, conditionId: pos.conditionId,
        preBalance: (preBalance as ethers.BigNumber).toString(),
        postBalance: (postBal as ethers.BigNumber).toString() },
      'Reconciler: PayoutRedemption.payout == 0 — wrong collateral or already redeemed',
    );
    result.error = `payout==0 after redemption — wrong collateral: ${detection.collateralToken}`;
    return { succeeded: false, payoutInDollars: 0 };
  }

  // 7. Post-redemption balance verification + DB/wallet update
  const postBalance: any = await collateral.balanceOf(walletAddress);
  const payoutInDollars = parseFloat(ethers.utils.formatUnits(payout as ethers.BigNumber, 6));
  const realizedPnl = payoutInDollars - pos.totalCost;

  logger.info(
    { positionId: result.positionId, conditionId: pos.conditionId, txHash: tx.hash as string,
      collateralToken: detection.collateralToken, payout: payoutInDollars, realizedPnl,
      preBalance: (preBalance as ethers.BigNumber).toString(),
      postBalance: (postBalance as ethers.BigNumber).toString() },
    'Reconciler: redemption successful',
  );

  // 8. Update wallet balance and close DB — only after on-chain payout confirmed > 0
  this.wallet.updateBalance(payoutInDollars);
  db.closePosition(this.walletId, pos.marketId, pos.outcome, realizedPnl);

  result.payoutAmount = payoutInDollars;
  result.realizedPnl = realizedPnl;

  return { succeeded: true, payoutInDollars };
}
```

### Five-question audit

| # | Question | Answer |
|---|----------|--------|
| 1 | Calls `redeemPositions` + waits for receipt | **Yes** — lines 377–407: `ctf.redeemPositions(...)` then `await tx.wait(1)` |
| 2 | Calls `detectCollateralToken` first | **Yes** — lines 315–339: called before any tx is submitted |
| 3 | Parses `PayoutRedemption` event | **Yes** — lines 431–439: loops receipt logs via `PAYOUT_REDEMPTION_IFACE.parseLog` |
| 4 | `updateBalance` only after receipt confirmed | **Yes** — line 491: called after receipt.status===1 and payout>0 checks pass |
| 5 | `closePosition` only after payout > 0 confirmed | **Yes** — line 492: same gate; payout==0 halts before this line |

### Verdict

**Task 2 needed: no.** All five checks pass. The patch has already been applied. The live-mode RESOLVED_WINNER path submits a real on-chain redemption tx, waits for the receipt, parses the PayoutRedemption event, and gates all DB and wallet updates on confirmed payout > 0.

---

## Task 2: Patch

Not required — all five audit criteria are satisfied by the current code.

For historical reference, the files that were modified to produce the current state (from the prior stub implementation) were:

| File | Change |
|------|--------|
| `src/reconciliation/collateral_detector.ts` | Added `CTF_ADDRESS` export, `CollateralDetectionResult` interface, `detectCollateralToken()` |
| `src/storage/trades_db.ts` | Added `getLatestTxHash(walletId, marketId, outcome)` — line 247 |
| `src/wallets/polymarket_wallet.ts` | Added `getSigner()` method |
| `src/wallets/wallet_manager.ts` | Added `getSigner?(): Signer` to `ExecutionWallet` interface |
| `src/reconciliation/position_reconciler.ts` | Replaced `processResolved` stub with `redeemWinner` (async, full on-chain) + `closeLoser` (DB-only) |

### WalletRef interface change

`getSigner` is **optional** in `WalletRef` (line 61 of `position_reconciler.ts`):

```typescript
interface WalletRef {
  updateBalance(delta: number): void;
  /** Required for live-mode redemptions. PolymarketWallet implements this; PaperWallet does not. */
  getSigner?(): ethers.Signer;
}
```

The reconciler guards against its absence at the top of `redeemWinner` (lines 347–354). If the wallet doesn't implement `getSigner`, the position logs an error and returns `{ succeeded: false }` — no redemption is submitted, no DB mutation occurs. This preserves structural compatibility with `PaperWallet` and test doubles.

### `tx_hash` lookup in trades table

`TradesDB.getLatestTxHash` at `src/storage/trades_db.ts:247`:

```typescript
getLatestTxHash(walletId: string, marketId: string, outcome: string): string | null {
  try {
    const row = this.db.prepare(
      `SELECT tx_hash FROM trades WHERE wallet_id = ? AND market_id = ? AND outcome = ? ORDER BY timestamp DESC LIMIT 1`,
    ).get(walletId, marketId, outcome) as { tx_hash: string | null } | undefined;
    return row?.tx_hash ?? null;
  } catch {
    return null;
  }
}
```

Returns `null` when no matching trade exists or `tx_hash` was not recorded. The reconciler treats `null` as a hard skip — no collateral detection is attempted, no tx is submitted.

### Build status

```
> polymarket-multi-strategy-platform@0.1.0 build
> tsc -p tsconfig.json

[no errors — exit 0]
```

### Updated dry-run expectation

The pinned validation expectation from the original build report is unchanged — dry-run never executes `redeemWinner` or `closeLoser`. The first LIVE cycle (after operator sets `RECONCILER_DRY_RUN=false`) is when redemption txs will fire for any RESOLVED_WINNER positions (id=1, id=13 if either is a winner).

---

## Operator Notes

- **First live cycle** will submit on-chain `redeemPositions` txs for any RESOLVED_WINNER positions. Watch Polygonscan for the wallet's tx history.
- Each redemption costs ~$0.01 in gas (Polygon). Gas settings: 35 gwei priority / 150 gwei max fee.
- If `detectCollateralToken` returns `null` (tx_hash missing, receipt not found, or no `PositionSplit` event in the receipt), the position is **not redeemed** and logs an ERROR. It will retry on the next reconciler cycle. Manual handling is required if it persists.
- `payout == 0` after a submitted tx indicates wrong collateral or double-redemption. The error is logged with `{ collateralToken, indexSet, conditionId, preBalance, postBalance }`. Position will retry next cycle.
- RESOLVED_LOSER positions are closed in DB only (`closeLoser`) — no on-chain action.
- CTF address: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` (exported from `collateral_detector.ts:4` as `CTF_ADDRESS`).
