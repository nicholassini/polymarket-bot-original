import { ethers } from 'ethers';
import { logger } from '../reporting/logs';
import { getTradesDB, PersistedPosition } from '../storage/trades_db';
import {
  checkConditionResolution,
  detectCollateralToken,
  fetchClobMarket,
  ClobMarket,
  ResolutionStatus,
  CollateralDetectionResult,
  CTF_ADDRESS,
  NEG_RISK_ADAPTER_ADDRESS,   // added
  NEG_RISK_ADAPTER_ABI,       // added
  USDCE_ADDRESS,              // added
} from './collateral_detector';

export type PositionClassification =
  | 'ACTIVE'
  | 'RESOLVED_WINNER'
  | 'RESOLVED_LOSER'
  | 'NEG_RISK_SKIP'
  | 'ANOMALY';

export interface ReconcilePositionResult {
  positionId: number | undefined;
  conditionId: string | undefined;
  marketId: string;
  outcome: string;
  classification: PositionClassification;
  payoutAmount: number;
  realizedPnl: number;
  /**
   * Index of pos.tokenId in the CLOB tokens[] array, derived during classification.
   * Used by redeemWinner to construct indexSet (1 << outcomeIndex) without
   * relying on a YES/NO string match.
   * Undefined when classification halted before reaching the tokens lookup
   * (missing conditionId, missing tokenId, CLOB unavailable).
   */
  outcomeIndex?: number;
  /** True when the CLOB market reports neg_risk. Routes run() to the
   *  NegRiskAdapter redemption path instead of the CTF path. */
  isNegRisk?: boolean;
  error?: string;
}

export interface ReconcileSummary {
  runAt: string;
  dryRun: boolean;
  tick: number;
  durationMs: number;
  positionsChecked: number;
  active: number;
  resolvedWinner: number;
  resolvedLoser: number;
  negRiskSkip: number;
  anomaly: number;
  errors: number;
  totalPayoutProcessed: number;
  /** Number of on-chain redeemPositions calls attempted (live mode only). */
  redemptionsAttempted: number;
  /** Number that completed with payout > 0. */
  redemptionsSucceeded: number;
  /** Sum of all confirmed on-chain payouts in dollars. */
  capitalRecovered: number;
  positions: ReconcilePositionResult[];
}

/**
 * WalletRef interface — EXPANDED from original minimal form to include getSigner().
 *
 * getSigner() was added to give the reconciler a signed ethers.Signer for submitting
 * on-chain CTF.redeemPositions calls without the reconciler holding its own private key.
 * PolymarketWallet implements this by constructing an ethers.Wallet from POLYMARKET_PRIVATE_KEY.
 */
interface WalletRef {
  updateBalance(delta: number): void;
  /** Required for live-mode redemptions. PolymarketWallet implements this; PaperWallet does not. */
  getSigner?(): ethers.Signer;
}

export interface ReconcilerConfig {
  walletId: string;
  wallet: WalletRef;
  /**
   * CLOB API base URL — e.g. 'https://clob.polymarket.com'.
   * Replaces the previous gammaApi field. CLOB is the authoritative source for
   * neg_risk status and tokens[] array; Gamma's response shape (camelCase fields,
   * silently-ignored condition_id filter) made it unreliable for reconciliation.
   */
  clobApi: string;
  rpcUrl: string;
  /** Archive node URL for fetching old tx receipts; falls back to rpcUrl if omitted. */
  archiveRpcUrl?: string;
  dryRun: boolean;
}

const CTF_ABI = [
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata indexSets) external',
  'event PayoutRedemption(address indexed redeemer, address indexed collateralToken, bytes32 indexed parentCollectionId, bytes32 conditionId, uint256[] indexSets, uint256 payout)',
];

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

const PAYOUT_REDEMPTION_IFACE = new ethers.utils.Interface([
  'event PayoutRedemption(address indexed redeemer, address indexed collateralToken, bytes32 indexed parentCollectionId, bytes32 conditionId, uint256[] indexSets, uint256 payout)',
]);

// Gas settings matching op8_redeem.js
const MAX_PRIORITY_FEE = ethers.utils.parseUnits('35', 'gwei');
const MAX_FEE = ethers.utils.parseUnits('150', 'gwei');

export class PositionReconciler {
  private readonly walletId: string;
  private readonly wallet: WalletRef;
  private readonly clobApi: string;
  private readonly rpcUrl: string;
  private readonly archiveRpcUrl: string;
  private readonly dryRun: boolean;

  constructor(config: ReconcilerConfig) {
    this.walletId = config.walletId;
    this.wallet = config.wallet;
    this.clobApi = config.clobApi;
    this.rpcUrl = config.rpcUrl;
    this.archiveRpcUrl = config.archiveRpcUrl ?? config.rpcUrl;
    this.dryRun = config.dryRun;
  }

  async run(tick = 0): Promise<ReconcileSummary> {
    const runAt = new Date().toISOString();
    const startMs = Date.now();
    const db = getTradesDB();
    const positions = db.loadOpenPositions(this.walletId);

    logger.info(
      { tick, positionCount: positions.length, dryRun: this.dryRun },
      'Reconciler: starting cycle',
    );

    const results: ReconcilePositionResult[] = [];
    let active = 0, resolvedWinner = 0, resolvedLoser = 0, negRiskSkip = 0, anomaly = 0, errors = 0;
    let totalPayoutProcessed = 0, redemptionsAttempted = 0, redemptionsSucceeded = 0, capitalRecovered = 0;

    for (const pos of positions) {
      const result = await this.classifyPosition(pos);
      results.push(result);

      logger.info(
        { positionId: result.positionId, conditionId: result.conditionId, classification: result.classification, outcomeIndex: result.outcomeIndex },
        'Reconciler: position classified',
      );

      switch (result.classification) {
        case 'ACTIVE':          active++;          break;
        case 'RESOLVED_WINNER': resolvedWinner++;  break;
        case 'RESOLVED_LOSER':  resolvedLoser++;   break;
        case 'NEG_RISK_SKIP':
          negRiskSkip++;
          logger.warn(
            { positionId: result.positionId, conditionId: result.conditionId },
            'Reconciler: NEG_RISK_SKIP',
          );
          break;
        case 'ANOMALY':
          anomaly++;
          logger.warn(
            { positionId: result.positionId, conditionId: result.conditionId, error: result.error },
            'Reconciler: ANOMALY',
          );
          break;
      }

      if (!this.dryRun) {
        if (result.classification === 'RESOLVED_WINNER') {
          redemptionsAttempted++;
          const redeemResult = result.isNegRisk
            ? await this.redeemWinnerNegRisk(pos, result)
            : await this.redeemWinner(pos, result);
          if (redeemResult.succeeded) {
            redemptionsSucceeded++;
            capitalRecovered += redeemResult.payoutInDollars;
            totalPayoutProcessed += redeemResult.payoutInDollars;
          }
        } else if (result.classification === 'RESOLVED_LOSER') {
          // Generic DB-only close — works for both standard and neg-risk losers.
          // This is the other half of gap #1: neg-risk losers used to be skipped.
          this.closeLoser(pos, result);
        }
      }

      if (result.error) errors++;
    }

    const summary: ReconcileSummary = {
      runAt,
      dryRun: this.dryRun,
      tick,
      durationMs: Date.now() - startMs,
      positionsChecked: positions.length,
      active,
      resolvedWinner,
      resolvedLoser,
      negRiskSkip,
      anomaly,
      errors,
      totalPayoutProcessed,
      redemptionsAttempted,
      redemptionsSucceeded,
      capitalRecovered,
      positions: results,
    };

    logger.info({ summary }, 'Reconciler: cycle complete');
    return summary;
  }

  private async classifyPosition(pos: PersistedPosition): Promise<ReconcilePositionResult> {
    const base: Omit<ReconcilePositionResult, 'classification'> = {
      positionId: pos.id,
      conditionId: pos.conditionId,
      marketId: pos.marketId,
      outcome: pos.outcome,
      payoutAmount: 0,
      realizedPnl: 0,
    };

    // Step 1: conditionId required for all on-chain checks
    if (!pos.conditionId) {
      return { ...base, classification: 'ANOMALY', error: 'missing conditionId — cannot check resolution' };
    }

    // Step 2: tokenId required for outcome-index lookup against CLOB tokens[]
    if (!pos.tokenId) {
      return { ...base, classification: 'ANOMALY', error: 'missing tokenId — cannot derive outcomeIndex' };
    }

    // Step 3: Fetch CLOB market — authoritative source for neg_risk and tokens[] mapping
    let market: ClobMarket | null;
    try {
      market = await fetchClobMarket(this.clobApi, pos.conditionId);
    } catch (err) {
      return { ...base, classification: 'ANOMALY', error: `CLOB fetch threw: ${String(err)}` };
    }
    if (!market) {
      return {
        ...base,
        classification: 'ANOMALY',
        error: 'CLOB API unavailable or returned malformed response — cannot determine neg_risk or outcomeIndex',
      };
    }

    // Step 4: Record the neg-risk flag — do NOT skip.
    // Each neg-risk sub-question is itself a binary condition in the CTF, so the
    // resolution check below (payoutDenominator / payoutNumerators) is identical.
    // run() uses isNegRisk to pick the NegRiskAdapter redemption path.
    const isNegRisk = market.neg_risk === true;

    // Step 5: Derive outcomeIndex by matching pos.tokenId against CLOB tokens[].token_id.
    // This is the authoritative source — never infer from outcome string (which fails for
    // non-binary markets, non-standard outcome names, and even some binary markets where
    // YES/NO ordering differs from the assumed convention).
    const outcomeIndex = market.tokens.findIndex((t) => t.token_id === pos.tokenId);
    if (outcomeIndex === -1) {
      return {
        ...base,
        classification: 'ANOMALY',
        error: `position tokenId ${pos.tokenId} not found in CLOB tokens for condition ${pos.conditionId}`,
      };
    }

    // Step 6: Query ConditionalTokens contract for resolution status and all numerators
    let resolution: ResolutionStatus;
    try {
      resolution = await checkConditionResolution(pos.conditionId, this.rpcUrl, market.tokens.length);
    } catch (err) {
      return { ...base, classification: 'ANOMALY', error: `CTF call failed: ${String(err)}`, outcomeIndex };
    }

    if (!resolution.resolved) {
      return { ...base, classification: 'ACTIVE', outcomeIndex };
    }

    // Defensive: outcomeCount mismatch between CLOB tokens and CTF numerators
    if (outcomeIndex >= resolution.numerators.length) {
      return {
        ...base,
        classification: 'ANOMALY',
        error: `outcomeIndex ${outcomeIndex} out of range for ${resolution.numerators.length} on-chain numerators`,
        outcomeIndex,
      };
    }

    // Step 7: Determine winner from on-chain numerator at the derived index
    const numerator = resolution.numerators[outcomeIndex];
    const isWinner = numerator > 0n;

    // Step 8: Sanity check — on-chain numerator must agree with CLOB winner flag.
    // If they disagree, something is genuinely wrong (oracle dispute mid-flight, CLOB
    // metadata stale, etc.) and we should not auto-redeem.
    const clobWinner = market.tokens[outcomeIndex].winner;
    if (isWinner !== clobWinner) {
      logger.error(
        {
          positionId: pos.id,
          conditionId: pos.conditionId,
          outcomeIndex,
          numerator: String(numerator),
          denominator: String(resolution.payoutDenominator),
          clobWinner,
          isWinner,
        },
        'Reconciler: on-chain numerator disagrees with CLOB winner flag — refusing to classify',
      );
      return {
        ...base,
        classification: 'ANOMALY',
        error: `on-chain numerator (${numerator}) disagrees with CLOB winner flag (${clobWinner}) at outcomeIndex ${outcomeIndex}`,
        outcomeIndex,
      };
    }

    // Payout = size × (numerator / denominator)
    // For standard binary markets this resolves to size × 1 (winner) or 0 (loser).
    // For fractional resolutions (e.g., scalar markets), the proportional payout is computed.
    const payoutAmount = isWinner
      ? pos.size * Number(numerator) / Number(resolution.payoutDenominator)
      : 0;

    if (isWinner && payoutAmount === 0) {
      logger.error(
        {
          positionId: pos.id,
          conditionId: pos.conditionId,
          outcomeIndex,
          numerator: String(numerator),
          denominator: String(resolution.payoutDenominator),
        },
        'Reconciler: RESOLVED_WINNER computed payout=0 — unexpected; check numerator/denominator',
      );
    }

    const realizedPnl = payoutAmount - pos.totalCost;

    return {
      ...base,
      classification: isWinner ? 'RESOLVED_WINNER' : 'RESOLVED_LOSER',
      payoutAmount,
      realizedPnl,
      outcomeIndex,
      isNegRisk,   // added
    };
  }

  /**
   * Live-mode RESOLVED_WINNER path: detects collateral, submits CTF.redeemPositions,
   * waits for receipt, parses PayoutRedemption event, then updates DB + wallet balance.
   * Nothing is written to DB or wallet until on-chain payout is confirmed > 0.
   *
   * Relies on result.outcomeIndex set during classification. Does NOT re-derive
   * the index from outcome string — that approach was the v12 bug.
   */
  private async redeemWinner(
    pos: PersistedPosition,
    result: ReconcilePositionResult,
  ): Promise<{ succeeded: boolean; payoutInDollars: number }> {
    const db = getTradesDB();

    // 1. outcomeIndex must have been set by classifyPosition for any RESOLVED_WINNER.
    // If missing, classification skipped Step 5 — we cannot safely redeem.
    if (result.outcomeIndex === undefined) {
      logger.error(
        { positionId: result.positionId, conditionId: result.conditionId },
        'Reconciler: outcomeIndex missing on RESOLVED_WINNER — should be impossible; refusing to redeem',
      );
      result.error = 'outcomeIndex missing on RESOLVED_WINNER result';
      return { succeeded: false, payoutInDollars: 0 };
    }

    // 2. Look up the original trade tx_hash for PositionSplit event detection
    const txHash = db.getLatestTxHash(this.walletId, pos.marketId, pos.outcome);
    if (!txHash) {
      logger.error(
        { positionId: result.positionId, conditionId: result.conditionId, marketId: pos.marketId, outcome: pos.outcome },
        'Reconciler: no tx_hash in trades table — cannot detect collateral token',
      );
      result.error = 'no tx_hash in trades — cannot detect collateral token';
      return { succeeded: false, payoutInDollars: 0 };
    }

    // 3. Detect collateral token from the PositionSplit event in the original buy tx
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

    // 4. indexSet derived from outcomeIndex set during classification.
    // outcomeIndex is the position's index in CLOB tokens[] array (matched by token_id).
    // CTF.redeemPositions takes an array of indexSets, where each indexSet is a bitmask
    // of which outcome slots to redeem. For a single outcome at index i, indexSet = 1 << i.
    const indexSet = 1 << result.outcomeIndex;

    // 5. Read pre-redemption collateral balance
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // 6. Submit redemption tx
    const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, signer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        {
          positionId: result.positionId,
          conditionId: result.conditionId,
          collateralToken: detection.collateralToken,
          outcomeIndex: result.outcomeIndex,
          indexSet,
          err: String(err),
        },
        'Reconciler: redeemPositions call failed',
      );
      result.error = `redeemPositions call failed: ${String(err)}`;
      return { succeeded: false, payoutInDollars: 0 };
    }

    logger.info(
      { positionId: result.positionId, txHash: tx.hash as string, outcomeIndex: result.outcomeIndex, indexSet },
      'Reconciler: redemption tx submitted — waiting for receipt',
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // 7. Parse PayoutRedemption event from receipt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payout: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { positionId: result.positionId, txHash: tx.hash as string, logsCount: (receipt.logs as any[]).length },
        'Reconciler: no PayoutRedemption event in receipt — DB and balance NOT updated',
      );
      result.error = `no PayoutRedemption event in receipt ${tx.hash as string}`;
      return { succeeded: false, payoutInDollars: 0 };
    }

    // Halt: payout is zero (wrong collateral, wrong indexSet, or already redeemed)
    if ((payout as ethers.BigNumber).eq(0)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const postBal: any = await collateral.balanceOf(walletAddress);
      logger.error(
        {
          positionId: result.positionId,
          collateralToken: detection.collateralToken,
          outcomeIndex: result.outcomeIndex,
          indexSet,
          conditionId: pos.conditionId,
          preBalance: (preBalance as ethers.BigNumber).toString(),
          postBalance: (postBal as ethers.BigNumber).toString(),
        },
        'Reconciler: PayoutRedemption.payout == 0 — wrong collateral or already redeemed',
      );
      result.error = `payout==0 after redemption — wrong collateral: ${detection.collateralToken}`;
      return { succeeded: false, payoutInDollars: 0 };
    }

    // 8. Post-redemption balance verification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postBalance: any = await collateral.balanceOf(walletAddress);
    const payoutInDollars = parseFloat(ethers.utils.formatUnits(payout as ethers.BigNumber, 6));
    const realizedPnl = payoutInDollars - pos.totalCost;

    logger.info(
      {
        positionId: result.positionId,
        conditionId: pos.conditionId,
        txHash: tx.hash as string,
        collateralToken: detection.collateralToken,
        outcomeIndex: result.outcomeIndex,
        payout: payoutInDollars,
        realizedPnl,
        preBalance: (preBalance as ethers.BigNumber).toString(),
        postBalance: (postBalance as ethers.BigNumber).toString(),
      },
      'Reconciler: redemption successful',
    );

    // 9. Update wallet balance and close DB — only after on-chain payout confirmed > 0
    this.wallet.updateBalance(payoutInDollars);
    db.closePosition(this.walletId, pos.marketId, pos.outcome, realizedPnl);

    result.payoutAmount = payoutInDollars;
    result.realizedPnl = realizedPnl;

    return { succeeded: true, payoutInDollars };
  }

  /**
   * Live-mode RESOLVED_WINNER path for NEG-RISK markets.
   *
   * Differs from redeemWinner (standard CTF) in three ways:
   *   1. Redeems via NegRiskAdapter.redeemPositions(conditionId, amounts) — the
   *      2-arg signature, NOT the CTF 4-arg
   *      (collateral, parentCollectionId, conditionId, indexSets).
   *   2. No collateral detection. Neg-risk redemption always unwraps the
   *      adapter's WrappedCollateral and returns USDC.e, so we measure the
   *      USDC.e balance delta. No tx_hash / PositionSplit replay is needed —
   *      which matters, because neg-risk buys don't emit a CTF PositionSplit and
   *      our neg-risk rows have tx_hash = NULL.
   *   3. amounts is outcome-indexed (raw 6-dp units): the held outcome's slot
   *      gets size*1e6, the other slot gets 0. Each neg-risk sub-question is
   *      binary at the CTF level, so the array length is 2.
   */
  private async redeemWinnerNegRisk(
    pos: PersistedPosition,
    result: ReconcilePositionResult,
  ): Promise<{ succeeded: boolean; payoutInDollars: number }> {
    const db = getTradesDB();

    // outcomeIndex must have been set during classification (Step 5).
    if (result.outcomeIndex === undefined) {
      logger.error(
        { positionId: result.positionId, conditionId: result.conditionId },
        'Reconciler(negRisk): outcomeIndex missing on RESOLVED_WINNER — refusing to redeem',
      );
      result.error = 'outcomeIndex missing on neg-risk RESOLVED_WINNER';
      return { succeeded: false, payoutInDollars: 0 };
    }

    if (!this.wallet.getSigner) {
      logger.error(
        { positionId: result.positionId },
        'Reconciler(negRisk): wallet does not implement getSigner() — cannot submit redemption',
      );
      result.error = 'wallet does not implement getSigner()';
      return { succeeded: false, payoutInDollars: 0 };
    }

    const signer = this.wallet.getSigner();
    const walletAddress = await signer.getAddress();

    // Neg-risk redemption settles in USDC.e — measure the delta on that token.
    const collateral = new ethers.Contract(USDCE_ADDRESS, ERC20_ABI, signer);

    // Binary sub-question: 2 outcome slots. Held outcome gets size*1e6, other 0.
    // outcomeIndex is the position's index in CLOB tokens[]; we assume that order
    // matches the CTF outcome-slot order (same assumption the standard indexSet
    // path makes with `1 << outcomeIndex`). Validate in dry-run before trusting.
    const amounts = [ethers.constants.Zero, ethers.constants.Zero];
    amounts[result.outcomeIndex] = ethers.utils.parseUnits(String(pos.size), 6);

    let preBalance: ethers.BigNumber;
    try {
      preBalance = await collateral.balanceOf(walletAddress);
    } catch (err) {
      logger.error(
        { positionId: result.positionId, err: String(err) },
        'Reconciler(negRisk): pre-redemption USDC.e balance read failed',
      );
      result.error = `neg-risk pre-balance read failed: ${String(err)}`;
      return { succeeded: false, payoutInDollars: 0 };
    }

    const adapter = new ethers.Contract(
      NEG_RISK_ADAPTER_ADDRESS,
      NEG_RISK_ADAPTER_ABI,
      signer,
    );

    let receipt: ethers.providers.TransactionReceipt;
    try {
      const tx = await adapter.redeemPositions(pos.conditionId, amounts, {
        maxPriorityFeePerGas: MAX_PRIORITY_FEE,
        maxFeePerGas: MAX_FEE,
      });
      logger.info(
        {
          positionId: result.positionId,
          conditionId: pos.conditionId,
          txHash: tx.hash,
          amounts: amounts.map((a) => a.toString()),
        },
        'Reconciler(negRisk): redeemPositions submitted',
      );
      receipt = await tx.wait(1);
    } catch (err) {
      logger.error(
        { positionId: result.positionId, conditionId: pos.conditionId, err: String(err) },
        'Reconciler(negRisk): redeemPositions tx failed',
      );
      result.error = `neg-risk redeemPositions failed: ${String(err)}`;
      return { succeeded: false, payoutInDollars: 0 };
    }

    if (receipt.status !== 1) {
      result.error = `neg-risk redeemPositions reverted (status ${receipt.status})`;
      logger.error(
        { positionId: result.positionId, txHash: receipt.transactionHash },
        result.error,
      );
      return { succeeded: false, payoutInDollars: 0 };
    }

    let postBalance: ethers.BigNumber;
    try {
      postBalance = await collateral.balanceOf(walletAddress);
    } catch (err) {
      result.error = `neg-risk post-balance read failed: ${String(err)}`;
      logger.error({ positionId: result.positionId, err: String(err) }, result.error);
      return { succeeded: false, payoutInDollars: 0 };
    }

    // Confirm payout from the on-chain balance delta — robust regardless of
    // which events the adapter vs. the underlying CTF emit.
    const payoutRaw = postBalance.sub(preBalance);
    const payoutInDollars = Number(ethers.utils.formatUnits(payoutRaw, 6));

    if (payoutInDollars <= 0) {
      result.error =
        'neg-risk redemption settled 0 USDC.e — wrong outcomeIndex or already redeemed';
      logger.error(
        {
          positionId: result.positionId,
          conditionId: pos.conditionId,
          txHash: receipt.transactionHash,
          preBalance: preBalance.toString(),
          postBalance: postBalance.toString(),
        },
        result.error,
      );
      return { succeeded: false, payoutInDollars: 0 };
    }

    // Mutate DB + wallet only after confirmed payout > 0.
    const realizedPnl = payoutInDollars - pos.totalCost;
    this.wallet.updateBalance(payoutInDollars);
    db.closePosition(this.walletId, pos.marketId, pos.outcome, realizedPnl);

    result.payoutAmount = payoutInDollars;
    result.realizedPnl = realizedPnl;

    logger.info(
      { positionId: result.positionId, conditionId: pos.conditionId, payoutInDollars, realizedPnl },
      'Reconciler(negRisk): redeemed and closed',
    );
    return { succeeded: true, payoutInDollars };
  }

  /** RESOLVED_LOSER path: no redemption needed, just close the DB position. */
  private closeLoser(pos: PersistedPosition, result: ReconcilePositionResult): void {
    try {
      const db = getTradesDB();
      db.closePosition(pos.walletId, pos.marketId, pos.outcome, result.realizedPnl);
      logger.info(
        { positionId: result.positionId, conditionId: result.conditionId, realizedPnl: result.realizedPnl },
        'Reconciler: loser position closed',
      );
    } catch (err) {
      logger.error(
        { positionId: result.positionId, err: String(err) },
        'Reconciler: failed to close loser position',
      );
      result.error = `closeLoser failed: ${String(err)}`;
    }
  }
}