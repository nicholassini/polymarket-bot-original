/**
 * inventory.js — Read-only on-chain state inventory for the trading wallet.
 *
 * Reads every "open" position row in DB, queries the CTF contract for
 * on-chain balance, looks up market state via Gamma, classifies each
 * position into an exit bucket, and reports.
 *
 * No private key required. Pure read against Polygon RPC + Gamma HTTP.
 *
 * Usage: node inventory.js
 *
 * Compatible with ethers v5.
 */

'use strict';

const { ethers } = require('ethers');
const Database = require('better-sqlite3');

const RPC_URL = 'https://polygon-bor-rpc.publicnode.com';
const CTF_ADDR = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_E_ADDR = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const PUSD_ADDR = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
const POL_USDC_ADDR = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const WALLET = '0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935';

const WALLET_ID_FILTER = 'live_user_defined_1';

const ctfAbi = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
  'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
  'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
];

const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function fetchMarketByConditionId(conditionId) {
  const url = `https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[0];
  } catch (err) {
    return null;
  }
}

async function fetchMarketByTokenId(tokenId) {
  const url = `https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenId}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[0];
  } catch (err) {
    return null;
  }
}

function classifyPosition(pos, onChainBalanceBN, market) {
  const failed = onChainBalanceBN.lt(0);
  const balanceShares = failed
    ? -1
    : Number(ethers.utils.formatUnits(onChainBalanceBN, 6));

  if (!pos.token_id) {
    return {
      bucket: 'ORPHAN_INVESTIGATE',
      balanceShares,
      note: 'token_id NULL in DB; on-chain holding unknown via this path',
    };
  }

  if (failed) {
    return {
      bucket: 'BALANCE_QUERY_FAILED',
      balanceShares,
      note: 'balanceOf RPC call failed — retry inventory or check RPC',
    };
  }

  if (balanceShares === 0) {
    return {
      bucket: 'GHOST',
      balanceShares: 0,
      note: 'DB says open but on-chain balance is 0 — already sold/redeemed/transferred',
    };
  }

  if (!market) {
    return {
      bucket: 'NO_MARKET_DATA',
      balanceShares,
      note: 'Gamma returned no market for this conditionId/tokenId',
    };
  }

  let outcomeIndex = -1;
  let outcomeName = '?';
  try {
    const tokens = JSON.parse(market.clobTokenIds || '[]');
    const outcomes = JSON.parse(market.outcomes || '[]');
    outcomeIndex = tokens.findIndex(t => String(t) === String(pos.token_id));
    outcomeName = outcomes[outcomeIndex] !== undefined ? outcomes[outcomeIndex] : '?';
  } catch (e) {
    // ignore parse failure
  }

  const isResolved = market.closed === true || market.umaResolutionStatus === 'resolved';
  const isNegRisk = market.negRisk === true;

  if (isResolved) {
    let prices = [];
    try { prices = JSON.parse(market.outcomePrices || '[]').map(Number); } catch (e) {}
    const winnerIdx = prices.indexOf(1);
    if (winnerIdx === -1) {
      return {
        bucket: 'RESOLVED_NO_WINNER_DATA',
        balanceShares,
        outcomeName,
        note: 'market closed but outcome prices not [1,0]/[0,1] — manual lookup required',
      };
    }
    if (winnerIdx === outcomeIndex) {
      return {
        bucket: 'REDEEM',
        balanceShares,
        outcomeName,
        payoutUsd: balanceShares,
        conditionId: market.conditionId,
        isNegRisk,
      };
    } else {
      return {
        bucket: 'WORTHLESS',
        balanceShares,
        outcomeName,
        note: 'resolved as loser; shares are worth $0',
      };
    }
  }

  let currentBid = null;
  try {
    const prices = JSON.parse(market.outcomePrices || '[]').map(Number);
    currentBid = prices[outcomeIndex];
  } catch (e) {}

  const sellEstimate = currentBid !== null && !isNaN(currentBid)
    ? balanceShares * currentBid
    : null;

  if (isNegRisk) {
    return {
      bucket: 'NEGRISK_SELL',
      balanceShares,
      outcomeName,
      currentBid,
      sellEstimateUsd: sellEstimate,
      conditionId: market.conditionId,
      note: 'negRisk market — must sell on CLOB, cannot use standard redeem path',
    };
  }

  return {
    bucket: 'SELL_OR_HOLD',
    balanceShares,
    outcomeName,
    currentBid,
    sellEstimateUsd: sellEstimate,
    conditionId: market.conditionId,
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Polymarket trading wallet inventory');
  console.log(`  Wallet: ${WALLET}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const provider = new ethers.providers.StaticJsonRpcProvider(
  RPC_URL,
  { chainId: 137, name: 'polygon' }
);
  const ctf = new ethers.Contract(CTF_ADDR, ctfAbi, provider);

  // ── Section 1: ERC-20 balances ──
  console.log('─── ERC-20 balances ───');
  for (const [label, addr] of [
    ['USDC.e', USDC_E_ADDR],
    ['USDC native', POL_USDC_ADDR],
    ['pUSD', PUSD_ADDR],
  ]) {
    try {
      const c = new ethers.Contract(addr, erc20Abi, provider);
      const bal = await c.balanceOf(WALLET);
      const dec = await c.decimals();
      const sym = await c.symbol().catch(() => label);
      console.log(`  ${label.padEnd(14)} ${ethers.utils.formatUnits(bal, dec).padStart(14)} ${sym}`);
    } catch (err) {
      console.log(`  ${label.padEnd(14)} ERROR: ${err.message}`);
    }
  }
  const polBal = await provider.getBalance(WALLET);
  console.log(`  ${'POL (gas)'.padEnd(14)} ${ethers.utils.formatEther(polBal).padStart(14)} POL`);
  console.log('');

  // ── Section 2: DB positions vs on-chain ──
  const db = new Database('.runtime/trades.db', { readonly: true });
  const positions = db.prepare(`
    SELECT id, market_id, outcome, token_id, condition_id, size, avg_price, opened_at
    FROM positions
    WHERE status = 'open' AND wallet_id = ?
    ORDER BY id
  `).all(WALLET_ID_FILTER);

  console.log(`─── ${positions.length} open positions in DB ───\n`);

  const results = [];
  for (const pos of positions) {
    let onChainBalance = ethers.BigNumber.from(-1);
    if (pos.token_id) {
      try {
        onChainBalance = await ctf.balanceOf(WALLET, ethers.BigNumber.from(pos.token_id));
      } catch (err) {
        onChainBalance = ethers.BigNumber.from(-1);
        console.log(`  pos ${pos.id}: balanceOf failed: ${err.message}`);
      }
    }

    let market = null;
    if (pos.condition_id) {
      market = await fetchMarketByConditionId(pos.condition_id);
    } else if (pos.token_id) {
      market = await fetchMarketByTokenId(pos.token_id);
    }

    const classification = classifyPosition(pos, onChainBalance, market);
    results.push({ pos, onChainBalance, market, classification });

    const balanceLabel = classification.balanceShares === -1
      ? 'FAILED'
      : classification.balanceShares.toFixed(2);

    console.log(
      `pos ${String(pos.id).padStart(2)} │ DB outcome=${pos.outcome.padEnd(12)} ` +
      `│ DB size=${String(pos.size).padStart(4)} ` +
      `│ on-chain=${balanceLabel.padStart(7)} shares`
    );
    if (market) {
      const q = (market.question || '').slice(0, 70);
      console.log(`        question: ${q}`);
      console.log(`        on-chain outcome: ${classification.outcomeName || '?'}  closed=${market.closed}  negRisk=${market.negRisk}`);
    } else if (pos.condition_id || pos.token_id) {
      console.log(`        (no Gamma data found)`);
    }
    console.log(`        → bucket: ${classification.bucket}`);
    if (classification.note) console.log(`           ${classification.note}`);
    if (classification.payoutUsd !== undefined) {
      console.log(`           payout if redeemed: $${classification.payoutUsd.toFixed(2)}`);
    }
    if (classification.sellEstimateUsd !== undefined && classification.sellEstimateUsd !== null) {
      console.log(`           sell estimate at current bid (${classification.currentBid}): $${classification.sellEstimateUsd.toFixed(2)}`);
    }
    console.log('');

    await new Promise(r => setTimeout(r, 100));
  }

  // ── Section 3: Summary ──
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Summary by bucket');
  console.log('═══════════════════════════════════════════════════════════');
  const buckets = {};
  for (const r of results) {
    const b = r.classification.bucket;
    if (!buckets[b]) buckets[b] = [];
    buckets[b].push(r.pos.id);
  }
  for (const [b, ids] of Object.entries(buckets).sort()) {
    console.log(`  ${b.padEnd(24)} ${ids.length.toString().padStart(2)} position(s) → ids: ${ids.join(', ')}`);
  }

  let totalRedeem = 0;
  let totalSell = 0;
  for (const r of results) {
    if (r.classification.payoutUsd) totalRedeem += r.classification.payoutUsd;
    if (r.classification.sellEstimateUsd) totalSell += r.classification.sellEstimateUsd;
  }
  console.log('');
  console.log(`  Recoverable via redeem:        $${totalRedeem.toFixed(2)}`);
  console.log(`  Recoverable via sell (est):    $${totalSell.toFixed(2)}`);
  console.log(`  Total estimated recoverable:   $${(totalRedeem + totalSell).toFixed(2)}`);
  console.log('');

  db.close();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});