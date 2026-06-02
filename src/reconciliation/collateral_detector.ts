import { ethers } from 'ethers';

// Gnosis ConditionalTokens contract — same address for all Polymarket standard markets on Polygon
export const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

// NegRiskAdapter — multi-outcome (neg-risk) settlement. Forwards to the CTF
// and unwraps WrappedCollateral back to USDC.e on redemption.
export const NEG_RISK_ADAPTER_ADDRESS = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

// USDC.e — the collateral neg-risk redemptions always pay out in.
export const USDCE_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

export const NEG_RISK_ADAPTER_ABI = [
  'function redeemPositions(bytes32 _conditionId, uint256[] _amounts)',
];

const CTF_ABI = [
  'function payoutDenominator(bytes32) view returns (uint256)',
  'function payoutNumerators(bytes32, uint256) view returns (uint256)',
];

export interface ResolutionStatus {
  /** true when payoutDenominator > 0 — oracle has reported payout */
  resolved: boolean;
  payoutDenominator: bigint;
  /**
   * Numerators indexed by outcome index. numerators[i] = payoutNumerators(conditionId, i).
   * Length matches outcomeCount passed to checkConditionResolution.
   * Empty array when resolved=false.
   */
  numerators: bigint[];
}

export interface CollateralDetectionResult {
  /** ERC-20 address of the collateral used in the original trade, or null if not found. */
  collateralToken: string | null;
}

/**
 * Single token in a CLOB market response.
 * Matches the schema returned by GET https://clob.polymarket.com/markets/{conditionId}
 */
export interface ClobToken {
  token_id: string;
  outcome: string;
  price: number;
  winner: boolean;
}

/**
 * Subset of fields the reconciler reads from CLOB market responses.
 * The full response has more fields; we only type the ones we use.
 */
export interface ClobMarket {
  condition_id: string;
  question: string;
  closed: boolean;
  neg_risk: boolean;
  tokens: ClobToken[];
}

const POSITION_SPLIT_ABI = [
  'event PositionSplit(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)',
];

export async function detectCollateralToken(
  hotRpcUrl: string,
  archiveRpcUrl: string,
  conditionId: string,
  txHash: string,
  ctfAddress: string,
): Promise<CollateralDetectionResult> {
  const iface = new ethers.utils.Interface(POSITION_SPLIT_ABI);
  const urls = [hotRpcUrl];
  if (archiveRpcUrl && archiveRpcUrl !== hotRpcUrl) urls.push(archiveRpcUrl);

  for (const url of urls) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    let receipt: ethers.providers.TransactionReceipt | null = null;
    try {
      receipt = await provider.getTransactionReceipt(txHash);
    } catch {
      continue;
    }
    if (!receipt) continue;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== ctfAddress.toLowerCase()) continue;
      try {
        const parsed = iface.parseLog(log);
        if (
          parsed.name === 'PositionSplit' &&
          (parsed.args.conditionId as string).toLowerCase() === conditionId.toLowerCase()
        ) {
          return { collateralToken: parsed.args.collateralToken as string };
        }
      } catch { /* not this event */ }
    }
    return { collateralToken: null };
  }

  return { collateralToken: null };
}

/**
 * Fetches market metadata from the CLOB /markets/{conditionId} endpoint.
 *
 * This is the AUTHORITATIVE source for:
 *  - neg_risk flag (correctly snake_case here, unlike Gamma which uses negRisk)
 *  - tokens[] array mapping outcome names ↔ token_id ↔ winner status
 *
 * The reconciler uses this to derive outcomeIndex by matching pos.tokenId against
 * tokens[i].token_id, which is the only reliable way to determine which numerator
 * to read from CTF.payoutNumerators(conditionId, i) for win/loss classification.
 *
 * Returns null on any network or parse error. Callers should treat null as "cannot
 * classify safely — return ANOMALY" rather than guessing.
 */
export async function fetchClobMarket(
  clobApi: string,
  conditionId: string,
): Promise<ClobMarket | null> {
  const url = `${clobApi}/markets/${encodeURIComponent(conditionId)}`;
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch {
    return null;
  }
  if (!resp.ok) return null;
  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    return null;
  }
  // Defensive shape check: response must have a tokens array
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray((data as Record<string, unknown>).tokens)
  ) {
    return null;
  }
  return data as ClobMarket;
}

/**
 * Checks resolution status of a CTF condition by reading payoutDenominator and
 * all N payoutNumerators for outcomeCount outcomes.
 *
 * outcomeCount must match the actual number of outcomes the condition was prepared
 * with — derive from CLOB tokens.length, not from a YES/NO assumption.
 *
 * When resolved=true, numerators[i] gives the payout share for outcome index i,
 * scaled by payoutDenominator. For binary Polymarket markets, denominator is
 * typically 1 and numerators are [1, 0] or [0, 1].
 */
export async function checkConditionResolution(
  conditionId: string,
  rpcUrl: string,
  outcomeCount: number,
): Promise<ResolutionStatus> {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);

  const denom = (await ctf.payoutDenominator(conditionId)) as unknown as ethers.BigNumber;

  if (denom.eq(0)) {
    return { resolved: false, payoutDenominator: 0n, numerators: [] };
  }

  const numeratorPromises: Promise<ethers.BigNumber>[] = [];
  for (let i = 0; i < outcomeCount; i++) {
    numeratorPromises.push(ctf.payoutNumerators(conditionId, i) as Promise<ethers.BigNumber>);
  }
  const numeratorResults = await Promise.all(numeratorPromises);

  return {
    resolved: true,
    payoutDenominator: denom.toBigInt(),
    numerators: numeratorResults.map((n) => n.toBigInt()),
  };
}