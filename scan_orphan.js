// scan_orphans.js
// Read-only. Finds CTF ERC-1155 transfers TO the bot EOA inside the orphan
// open-window, decodes tokenIds, looks up markets on Gamma, classifies each.
//
// Run from project root:   node scan_orphans.js
// Output:                  console summary + orphan_scan_result.json
//
// Conventions: ethers v5, StaticJsonRpcProvider, polygon-bor-rpc.publicnode.com.
// Does NOT sign, send, or modify anything. Safe to run with leaked-key .env loaded
// or no .env at all — this script doesn't read any keys.

const fs = require('fs');
const { ethers } = require('ethers');

// ---------------------------------------------------------------- constants ---
const RPC_URL     = 'https://polygon-bor-rpc.publicnode.com';
const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const EOA         = '0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935';

// Orphan open-window per handoff: 5/2 21:22:59–21:23:53 UTC.
// Pad ±90s on each side so we don't miss anything on the edges.
const WINDOW_START_TS = Math.floor(Date.parse('2026-05-02T21:21:30Z') / 1000);
const WINDOW_END_TS   = Math.floor(Date.parse('2026-05-02T21:25:30Z') / 1000);

// Hint from handoff: ~block 86,500,000. Used only to seed binary search.
const BLOCK_HINT = 86_500_000;

const TRANSFER_SINGLE_TOPIC = ethers.utils.id(
  'TransferSingle(address,address,address,uint256,uint256)'
);
const TRANSFER_BATCH_TOPIC = ethers.utils.id(
  'TransferBatch(address,address,address,uint256[],uint256[])'
);

const ERC1155_IFACE = new ethers.utils.Interface([
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
]);

const provider = new ethers.providers.StaticJsonRpcProvider(
  RPC_URL,
  { chainId: 137, name: 'polygon' }
);

// ---------------------------------------------------------------- helpers ---
async function getBlockRetry(num, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const b = await provider.getBlock(num);
      if (b && b.timestamp) return b;
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 300 * (i + 1)));
  }
  throw lastErr || new Error(`getBlock(${num}) failed`);
}

// First block whose timestamp >= targetTs.
async function findBlockAtOrAfter(targetTs) {
  const latest = await provider.getBlockNumber();
  let lo = 1;
  let hi = latest;

  // Seed with the hint to shrink the search.
  try {
    const hintNum = Math.min(BLOCK_HINT, latest);
    const hintBlk = await getBlockRetry(hintNum);
    if (hintBlk.timestamp < targetTs) lo = hintBlk.number;
    else hi = hintBlk.number;
  } catch { /* ignore — fall back to full range */ }

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const blk = await getBlockRetry(mid);
    if (blk.timestamp < targetTs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

async function gammaLookup(tokenId) {
  // Gamma indexes markets by clob_token_ids. Try with closed=true first
  // (resolved markets are filtered out otherwise), then without.
  const tries = [
    `https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenId}&closed=true&limit=1`,
    `https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenId}&limit=1`,
  ];
  for (const url of tries) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data[0];
    } catch { /* try next */ }
  }
  return null;
}

function safeJson(s, fallback = null) {
  if (s == null) return fallback;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return fallback; }
}

function classify(market, tokenId, sharesRaw) {
  if (!market) {
    return {
      bucket: 'UNKNOWN',
      action: 'manual investigation — no Gamma hit for this tokenId',
    };
  }

  const tokenIds      = safeJson(market.clobTokenIds, []);
  const outcomes      = safeJson(market.outcomes, []);
  const outcomePrices = safeJson(market.outcomePrices, []).map(p => parseFloat(p));

  const idx = tokenIds.findIndex(t => String(t) === String(tokenId));
  const outcome = idx >= 0 ? outcomes[idx] : 'unknown';
  const price   = idx >= 0 ? outcomePrices[idx] : null;

  const closed   = market.closed === true;
  const negRisk  = market.negRisk === true;
  const sharesF  = parseFloat(ethers.utils.formatUnits(sharesRaw, 6));

  if (closed) {
    if (price === 1) {
      return {
        bucket: negRisk ? 'NEGRISK_REDEEM' : 'REDEEM',
        outcome, price,
        action: negRisk
          ? 'redeem via NegRisk adapter (we deliberately deferred this — leave for now)'
          : `redeem via CTF.redeemPositions for conditionId ${market.conditionId}`,
      };
    }
    return {
      bucket: 'WORTHLESS',
      outcome, price,
      action: 'leave on-chain (resolved loser)',
    };
  }

  // Active market.
  const valueEst = price != null ? sharesF * price : null;
  if (valueEst != null && valueEst < 1) {
    return {
      bucket: 'DUST',
      outcome, price, valueEst,
      action: 'skip (not worth gas)',
    };
  }
  return {
    bucket: negRisk ? 'NEGRISK_SELL' : 'SELL_OR_HOLD',
    outcome, price, valueEst,
    action: 'sell on CLOB (v2 SDK, leaked key, before rotation)',
  };
}

function pad(s, n) { return String(s).padEnd(n); }

// ---------------------------------------------------------------- main ---
async function main() {
  console.log('=== Polymarket Orphan Event Scan (read-only) ===');
  console.log('CTF:    ', CTF_ADDRESS);
  console.log('EOA:    ', EOA);
  console.log('Window: ', new Date(WINDOW_START_TS * 1000).toISOString(),
              '→', new Date(WINDOW_END_TS * 1000).toISOString());
  console.log();

  console.log('Resolving block range via timestamp binary search...');
  const fromBlock = await findBlockAtOrAfter(WINDOW_START_TS);
  const toBlock   = await findBlockAtOrAfter(WINDOW_END_TS);
  console.log(`  fromBlock: ${fromBlock}`);
  console.log(`  toBlock:   ${toBlock}`);
  console.log(`  span:      ${toBlock - fromBlock + 1} blocks`);
  console.log();

  const toPadded = ethers.utils.hexZeroPad(EOA.toLowerCase(), 32);

  // Two queries — some RPCs choke on topic-OR arrays in getLogs.
  console.log('Querying TransferSingle...');
  const singleLogs = await provider.getLogs({
    address: CTF_ADDRESS,
    topics:  [TRANSFER_SINGLE_TOPIC, null, null, toPadded],
    fromBlock, toBlock,
  });
  console.log(`  ${singleLogs.length} log(s)`);

  console.log('Querying TransferBatch...');
  const batchLogs = await provider.getLogs({
    address: CTF_ADDRESS,
    topics:  [TRANSFER_BATCH_TOPIC, null, null, toPadded],
    fromBlock, toBlock,
  });
  console.log(`  ${batchLogs.length} log(s)`);
  console.log();

  // Aggregate by tokenId. Multiple txs/transfers for the same token sum together.
  /** @type {Map<string,{shares:any,txs:Set<string>,blocks:Set<number>,from:Set<string>}>} */
  const byToken = new Map();

  function bump(tokenId, value, log, fromAddr) {
    if (!byToken.has(tokenId)) {
      byToken.set(tokenId, {
        shares: ethers.BigNumber.from(0),
        txs: new Set(), blocks: new Set(), from: new Set(),
      });
    }
    const e = byToken.get(tokenId);
    e.shares = e.shares.add(value);
    e.txs.add(log.transactionHash);
    e.blocks.add(log.blockNumber);
    if (fromAddr) e.from.add(fromAddr.toLowerCase());
  }

  for (const log of singleLogs) {
    const d = ERC1155_IFACE.parseLog(log);
    bump(d.args.id.toString(), d.args.value, log, d.args.from);
  }
  for (const log of batchLogs) {
    const d = ERC1155_IFACE.parseLog(log);
    for (let i = 0; i < d.args.ids.length; i++) {
      bump(d.args.ids[i].toString(), d.args.values[i], log, d.args.from);
    }
  }

  console.log(`Unique tokenIds received: ${byToken.size}`);
  console.log();

  const results = [];
  let i = 0;
  for (const [tokenId, e] of byToken) {
    i++;
    console.log(`[${i}/${byToken.size}] tokenId: ${tokenId}`);
    console.log(`  shares:   ${ethers.utils.formatUnits(e.shares, 6)} (raw ${e.shares.toString()})`);
    console.log(`  from:     ${[...e.from].join(', ') || '(none)'}`);
    console.log(`  txs:      ${[...e.txs].join(', ')}`);
    console.log(`  blocks:   ${[...e.blocks].sort((a, b) => a - b).join(', ')}`);

    const market = await gammaLookup(tokenId);
    if (market) {
      console.log(`  market:   ${market.question || market.slug || '(unnamed)'}`);
      console.log(`  cond:     ${market.conditionId}`);
      console.log(`  flags:    closed=${market.closed} negRisk=${market.negRisk} archived=${market.archived}`);
    } else {
      console.log(`  market:   NOT FOUND on Gamma`);
    }

    const cls = classify(market, tokenId, e.shares);
    console.log(`  → ${cls.bucket}` +
                (cls.outcome ? ` (outcome=${cls.outcome}, price=${cls.price})` : '') +
                (cls.valueEst != null ? ` est ≈ $${cls.valueEst.toFixed(2)}` : ''));
    console.log(`  → action: ${cls.action}`);
    console.log();

    results.push({
      tokenId,
      sharesRaw: e.shares.toString(),
      shares: ethers.utils.formatUnits(e.shares, 6),
      from: [...e.from],
      txs: [...e.txs],
      blocks: [...e.blocks].sort((a, b) => a - b),
      market: market ? {
        question:     market.question,
        slug:         market.slug,
        conditionId:  market.conditionId,
        closed:       market.closed,
        archived:     market.archived,
        negRisk:      market.negRisk,
        outcomes:     safeJson(market.outcomes, []),
        outcomePrices: safeJson(market.outcomePrices, []),
        clobTokenIds: safeJson(market.clobTokenIds, []),
      } : null,
      classification: cls,
    });

    await new Promise(r => setTimeout(r, 250)); // be nice to Gamma
  }

  // ----- summary -----
  console.log('=== Summary ===');
  console.log(pad('bucket', 18), pad('shares', 12), 'market');
  console.log('-'.repeat(80));
  for (const r of results) {
    const q = r.market?.question?.slice(0, 50) || '(unknown market)';
    console.log(pad(r.classification.bucket, 18), pad(r.shares, 12), q);
  }

  fs.writeFileSync('orphan_scan_result.json', JSON.stringify(results, null, 2));
  console.log('\nWrote orphan_scan_result.json');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});