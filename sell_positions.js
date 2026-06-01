// sell_positions.js
// Sells positions 2, 3, 5 + the River Plate orphan on Polymarket CLOB v2.
// Run:
//   node sell_positions.js                     # preview only, no orders posted
//   $env:CONFIRM=1; node sell_positions.js     # actually post (PowerShell)
//   CONFIRM=1 node sell_positions.js           # actually post (bash/zsh)
//
// Signs with POLYMARKET_PRIVATE_KEY from .env (leaked key — fine here, rotates next).
// Pre-flight per-position:
//   1. signer matches expected EOA
//   2. CTF approvals set for both Exchange V2 and Neg Risk Exchange V2
//   3. on-chain CTF balance >= intended size
//   4. market still open
//   5. best bid * size >= $1 (V2 minimum notional)
//   6. limit price rounded to the market's actual tick size
// Then posts a GTC sell at the (rounded) best bid for each, waits 30s,
// reports what filled.

require('dotenv').config();
const { ethers } = require('ethers');

// ESM dynamic import workaround for v2 SDK (matches src/utils/clob_sdk.ts)
const dynamicImport = new Function('s', 'return import(s)');

// ---------- constants ----------
const RPC_URL                  = 'https://polygon-bor-rpc.publicnode.com';
const CLOB_API                 = 'https://clob.polymarket.com';
const CTF                      = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const CTF_EXCHANGE_V2          = '0xE111180000d2663C0091e4f400237545B87B996B';
const NEG_RISK_CTF_EXCHANGE_V2 = '0xe2222d279d744050d28e00520010520000310F59';
const EXPECTED_EOA             = '0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935';
const V2_MIN_NOTIONAL          = 1.0;

// ---------- positions to sell ----------
const SELL_POSITIONS = [
  {
    label: 'pos 2 — Printr $15M public sale (NO)',
    tokenId: '12709310113797716739680036441897697844707405148517516517306923313276673984406',
    conditionId: '0xd9c3cba9982e6d16440808b0aebcf8ab3d0e67ad58d0e8acad2d1d1801f9a252',
    size: 5,
  },
  {
    label: 'pos 3 — Anthropic best AI June 2026 (NO)',
    tokenId: '30662373172786599831266104485692607706499745571163346900841435096131975532212',
    conditionId: '0xa4d72632ac0ddadcac5247ffc586a193f1bc3bc839cf9ce993c2471e0d599cca',
    size: 5,
  },
  {
    label: 'pos 5 — Anthropic best AI May 2026 (NO)',
    tokenId: '103223651126857597250083972358491919359906751647582548104436474509173953438279',
    conditionId: '0x5072d0bf27763754b734c63255c4cbbba79d9d09b214accf33ecc79b88b1d108',
    size: 5,
  },
  {
    label: 'orphan — CA River Plate 2026-03-08 (No)',
    tokenId: '100223828145771557365481497973228524653584015683453730224651209016438239024987',
    conditionId: '0x441a76dd2bb884e6a35b0e29755b49c9296dca3855e1403e341ae5fcc698de5c',
    size: 5,
  },
];

const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  return res.json();
}

// Round price down to the nearest tick. Sell at "tick or better" — bids
// at higher prices will still cross at their (better) price.
function floorToTick(price, tick) {
  // Use scaled-int arithmetic to avoid floating-point drift.
  const scale = Math.round(1 / tick);
  return Math.floor(price * scale) / scale;
}

// ---------- main ----------
async function main() {
  console.log('=== Polymarket sell positions (2, 3, 5, orphan) ===\n');

  const key = process.env.POLYMARKET_PRIVATE_KEY;
  if (!key) {
    console.error('FATAL: POLYMARKET_PRIVATE_KEY not in .env');
    process.exit(1);
  }

  // --- ethers setup ---
  const provider = new ethers.providers.StaticJsonRpcProvider(
    RPC_URL, { chainId: 137, name: 'polygon' }
  );
  const wallet = new ethers.Wallet(key, provider);
  console.log('signer:        ', wallet.address);
  console.log('expected EOA:  ', EXPECTED_EOA);
  if (wallet.address.toLowerCase() !== EXPECTED_EOA.toLowerCase()) {
    console.error('FATAL: signer does not match expected EOA. Bailing.');
    process.exit(1);
  }
  console.log('  ✓ matches\n');

  const polBal = await provider.getBalance(wallet.address);
  console.log(`POL balance:    ${ethers.utils.formatEther(polBal)}\n`);

  // --- allowance check (CTF must be approved on both exchanges) ---
  console.log('Checking CTF allowances...');
  const ctf = new ethers.Contract(CTF, ERC1155_ABI, provider);
  const approvedRegular = await ctf.isApprovedForAll(wallet.address, CTF_EXCHANGE_V2);
  const approvedNegRisk = await ctf.isApprovedForAll(wallet.address, NEG_RISK_CTF_EXCHANGE_V2);
  console.log(`  CTF → CTF Exchange V2:        ${approvedRegular ? '✓' : '✗ MISSING'}`);
  console.log(`  CTF → Neg Risk Exchange V2:   ${approvedNegRisk ? '✓' : '✗ MISSING'}`);
  if (!approvedRegular || !approvedNegRisk) {
    console.error('\nFATAL: missing CTF approval(s). Run set_allowances_v2.js first.');
    process.exit(1);
  }
  console.log();

  // --- per-position pre-flight ---
  console.log('Per-position pre-flight:\n');
  const plans = [];

  for (const pos of SELL_POSITIONS) {
    console.log(`[${pos.label}]`);
    console.log(`  tokenId:    ${pos.tokenId}`);

    // 1. Market info (tick size, negRisk, closed status)
    let market;
    try {
      market = await fetchJSON(`${CLOB_API}/markets/${pos.conditionId}`);
    } catch (err) {
      console.log(`  ✗ market fetch failed: ${err.message}\n`);
      plans.push({ pos, skip: true, reason: 'market fetch failed' });
      continue;
    }
    const tickSize = market.minimum_tick_size || '0.01';
    const negRisk  = market.neg_risk === true;
    console.log(`  market:     ${market.question || '(unnamed)'}`);
    console.log(`  tick size:  ${tickSize},  neg_risk: ${negRisk}`);

    if (market.closed) {
      console.log(`  ✗ market closed; skip\n`);
      plans.push({ pos, skip: true, reason: 'market closed' });
      continue;
    }

    // 2. On-chain CTF balance
    const sharesRaw = await ctf.balanceOf(wallet.address, pos.tokenId);
    const sharesF   = parseFloat(ethers.utils.formatUnits(sharesRaw, 6));
    console.log(`  shares held: ${sharesF}`);
    if (sharesF < pos.size) {
      console.log(`  ✗ on-chain balance ${sharesF} < intended ${pos.size}; skip\n`);
      plans.push({ pos, skip: true, reason: `insufficient shares (${sharesF})` });
      continue;
    }

    // 3. Orderbook
    let book;
    try {
      book = await fetchJSON(`${CLOB_API}/book?token_id=${pos.tokenId}`);
    } catch (err) {
      console.log(`  ✗ orderbook fetch failed: ${err.message}\n`);
      plans.push({ pos, skip: true, reason: 'orderbook fetch failed' });
      continue;
    }

    const bids = (book.bids || []).filter(b => parseFloat(b.size) > 0);
    if (bids.length === 0) {
      console.log(`  ✗ no bids on the book; nothing to sell into; skip\n`);
      plans.push({ pos, skip: true, reason: 'no bids' });
      continue;
    }

    const bestBid = bids.reduce((best, b) =>
      parseFloat(b.price) > parseFloat(best.price) ? b : best
    );
    const bestBidPrice = parseFloat(bestBid.price);
    console.log(`  best bid:    ${bestBidPrice}  (depth ${bestBid.size})`);

    // 4. Round to tick
    const tickF = parseFloat(tickSize);
    const limitPrice = floorToTick(bestBidPrice, tickF);
    console.log(`  limit price: ${limitPrice}`);

    // 5. V2 minimum notional
    const notional = limitPrice * pos.size;
    if (notional < V2_MIN_NOTIONAL) {
      console.log(`  ✗ notional $${notional.toFixed(4)} below $${V2_MIN_NOTIONAL} V2 min; skip\n`);
      plans.push({ pos, skip: true, reason: `notional $${notional.toFixed(2)} < min` });
      continue;
    }

    console.log(`  ✓ ready: SELL ${pos.size} @ ${limitPrice}  (notional $${notional.toFixed(2)})\n`);
    plans.push({ pos, skip: false, limitPrice, tickSize, negRisk, notional });
  }

  // --- summary ---
  const ready   = plans.filter(p => !p.skip);
  const skipped = plans.filter(p =>  p.skip);
  console.log('=== Summary ===');
  console.log(`  ready: ${ready.length}`);
  for (const p of ready) {
    console.log(`    ${p.pos.label} — SELL ${p.pos.size} @ ${p.limitPrice}  ($${p.notional.toFixed(2)})`);
  }
  console.log(`  skipped: ${skipped.length}`);
  for (const p of skipped) {
    console.log(`    ${p.pos.label} — ${p.reason}`);
  }
  console.log();

  if (process.env.CONFIRM !== '1') {
    console.log('CONFIRM != 1 — preview only. Re-run to actually post:');
    console.log('  PowerShell:  $env:CONFIRM=1; node sell_positions.js');
    console.log('  bash/zsh:    CONFIRM=1 node sell_positions.js');
    return;
  }

  if (ready.length === 0) {
    console.log('Nothing ready to post. Done.');
    return;
  }

  // --- init CLOB v2 client (mirrors src/utils/clob_client.ts) ---
  console.log('Initializing CLOB v2 client...');
  const sdk = await dynamicImport('@polymarket/clob-client-v2');
  const { ClobClient, Chain, Side, OrderType } = sdk;

  const tempClient = new ClobClient({
    host: CLOB_API,
    chain: Chain.POLYGON,
    signer: wallet,
  });
  console.log('  deriving API credentials...');
  const creds = await tempClient.createOrDeriveApiKey();
  const client = new ClobClient({
    host: CLOB_API,
    chain: Chain.POLYGON,
    signer: wallet,
    creds,
    funderAddress: wallet.address,
  });
  console.log('  ✓ client ready\n');

  // --- post orders ---
  console.log('Posting sell orders...\n');
  const results = [];
  for (const plan of ready) {
    console.log(`[${plan.pos.label}]`);
    console.log(`  SELL ${plan.pos.size} @ ${plan.limitPrice}  (tick ${plan.tickSize})`);

    try {
      // Mirroring src/wallets/polymarket_wallet.ts line 253–262:
      //   options object holds tickSize only; the SDK auto-routes negRisk markets.
      const resp = await client.createAndPostOrder(
        {
          tokenID: plan.pos.tokenId,
          price:   plan.limitPrice,
          size:    plan.pos.size,
          side:    Side.SELL,
        },
        { tickSize: plan.tickSize },
        OrderType.GTC,
      );
      console.log(`  raw response: ${JSON.stringify(resp)}`);

      if (resp && resp.success === false) {
        console.log(`  ✗ rejected: ${resp.errorMsg || 'unknown'}`);
        results.push({ plan, ok: false, reason: resp.errorMsg });
      } else if (resp && resp.error) {
        console.log(`  ✗ rejected: ${resp.error}`);
        results.push({ plan, ok: false, reason: resp.error });
      } else {
        const orderId = (resp && (resp.orderID || resp.orderId)) || '(no id)';
        console.log(`  ✓ posted: orderId=${orderId}`);
        results.push({ plan, ok: true, orderId });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ error: ${msg}`);
      results.push({ plan, ok: false, reason: msg });
    }

    // Small pause between posts.
    await new Promise(r => setTimeout(r, 500));
    console.log();
  }

  // --- 30s wait, then re-check on-chain to see what filled ---
  console.log('Waiting 30s for fills to settle...\n');
  await new Promise(r => setTimeout(r, 30_000));

  console.log('On-chain balances after settlement:');
  for (const plan of ready) {
    const after = await ctf.balanceOf(wallet.address, plan.pos.tokenId);
    const afterF = parseFloat(ethers.utils.formatUnits(after, 6));
    const filled = plan.pos.size - afterF;
    console.log(`  ${plan.pos.label}`);
    console.log(`    shares: ${afterF} (was ${plan.pos.size}, filled ${filled.toFixed(2)})`);
  }

  console.log('\nDone.');
  console.log('Note: any unfilled orders are GTC and remain on the book.');
  console.log('      They will fill if a buyer crosses the price, or you can cancel');
  console.log('      them via the Polymarket UI / API before key rotation.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});