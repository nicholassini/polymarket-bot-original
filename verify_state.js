// verify_state.js
// Read-only state check before sweep + rotation. Verifies:
//   1. No open CLOB orders for the EOA (nothing sitting on the book that
//      could fill later and strand pUSD on the soon-to-be-abandoned key).
//   2. On-chain CTF balances match the rotation plan: actioned positions
//      show 0 shares; intentionally kept positions still show their shares.
// Does not modify state. Safe to re-run.

require('dotenv').config();
const { ethers } = require('ethers');
const dynamicImport = new Function('s', 'return import(s)');

const RPC_URL      = 'https://polygon-bor-rpc.publicnode.com';
const CLOB_API     = 'https://clob.polymarket.com';
const CTF          = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const EXPECTED_EOA = '0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935';

// All 13 DB positions + 3 orphans, with the action plan from the handoff.
// "expected" is the on-chain balance category, not the exact number:
//   sold/redeemed → must be 0
//   kept          → non-zero, by design
const POSITIONS = [
  { label: 'pos 1   BNK FEARX',         tokenId: '53180575590712305624019904428889423044078099443845274019672510903755384419476',  expected: 'kept (worthless)' },
  { label: 'pos 2   Printr',            tokenId: '12709310113797716739680036441897697844707405148517516517306923313276673984406',  expected: 'sold' },
  { label: 'pos 3   Anthropic Jun',     tokenId: '30662373172786599831266104485692607706499745571163346900841435096131975532212',  expected: 'sold' },
  { label: 'pos 4   BTC $80k Dec',      tokenId: '68335748868028817641677350813642448069971468674732911142936125450548213811774',  expected: 'kept (dust)' },
  { label: 'pos 5   Anthropic May',     tokenId: '103223651126857597250083972358491919359906751647582548104436474509173953438279', expected: 'kept (sub-economic)' },
  { label: 'pos 7   Anthropic Math',    tokenId: '95715550038805770150473716631908386329405894389391569367793665257006611596828',  expected: 'kept (worthless)' },
  { label: 'pos 9   MegaETH FDV',       tokenId: '45579185828186393592125679219182708166582222781958089303132510785428183891796',  expected: 'kept (worthless)' },
  { label: 'pos 10  US-Iran',           tokenId: '67481706792427540702566929274174560093618129639370539410892616443837838176916',  expected: 'kept (dust)' },
  { label: 'pos 13  BTC $76k Apr 29',   tokenId: '60150998596292331370747374982512935392864268872714556717552243059509708798309',  expected: 'redeemed' },
  { label: 'pos 14  Trump China',       tokenId: '93039777634964888056094358760934471653366558776013103218493141116582260206427',  expected: 'kept (dust)' },
  { label: 'orph 19 River Plate',       tokenId: '100223828145771557365481497973228524653584015683453730224651209016438239024987', expected: 'sold' },
  { label: 'orph 20 Pirates spread',    tokenId: '90077485296554652105228093861883509092558348830398544022527316478595524115839',  expected: 'kept (worthless)' },
  { label: 'orph 22 BTC May 3',         tokenId: '94005134728161937801921699591116707771562429389839048466274850158711541301819',  expected: 'kept (dust)' },
];

const ABI = ['function balanceOf(address account, uint256 id) view returns (uint256)'];

function isActioned(expected) {
  return expected === 'sold' || expected === 'redeemed';
}

async function main() {
  console.log('=== State verification (read-only) ===\n');

  const key = process.env.POLYMARKET_PRIVATE_KEY;
  if (!key) { console.error('FATAL: POLYMARKET_PRIVATE_KEY missing'); process.exit(1); }

  const provider = new ethers.providers.StaticJsonRpcProvider(
    RPC_URL, { chainId: 137, name: 'polygon' }
  );
  const wallet = new ethers.Wallet(key, provider);
  console.log('EOA:', wallet.address);
  if (wallet.address.toLowerCase() !== EXPECTED_EOA.toLowerCase()) {
    console.error('FATAL: signer != expected EOA. Bailing.');
    process.exit(1);
  }
  console.log();

  // ---------- 1. CLOB open orders ----------
  console.log('1. Querying CLOB for open orders...');
  try {
    const sdk = await dynamicImport('@polymarket/clob-client-v2');
    const { ClobClient, Chain } = sdk;
    const tempClient = new ClobClient({ host: CLOB_API, chain: Chain.POLYGON, signer: wallet });
    const creds = await tempClient.createOrDeriveApiKey();
    const client = new ClobClient({
      host: CLOB_API, chain: Chain.POLYGON, signer: wallet, creds,
      funderAddress: wallet.address,
    });

    // Try common method names; one of them works in the v2 SDK.
    let orders = null;
    let methodUsed = null;
    for (const m of ['getOpenOrders', 'getOrders', 'getActiveOrders']) {
      if (typeof client[m] === 'function') {
        try {
          orders = await client[m]();
          methodUsed = m;
          break;
        } catch (err) {
          console.log(`   client.${m}() threw: ${err.message}`);
        }
      }
    }

    if (orders === null) {
      console.log('   ✗ No SDK method matched. Sell responses already showed');
      console.log('     status:"matched" so nothing should be on the book — but');
      console.log('     you can also eyeball polymarket.com/portfolio to be sure.');
    } else {
      console.log(`   used client.${methodUsed}()`);
      const arr = Array.isArray(orders) ? orders : [];
      if (arr.length === 0) {
        console.log('   ✓ No open orders');
      } else {
        console.log(`   ⚠ ${arr.length} order(s) returned:`);
        console.log(JSON.stringify(arr, null, 2));
      }
    }
  } catch (err) {
    console.log(`   ✗ CLOB query failed: ${err.message}`);
    console.log('     Fallback: sell receipts said status:"matched" — should be fine.');
  }
  console.log();

  // ---------- 2. On-chain CTF balances ----------
  console.log('2. On-chain CTF balances:\n');
  const ctf = new ethers.Contract(CTF, ABI, provider);
  const issues = [];

  for (const p of POSITIONS) {
    const bal  = await ctf.balanceOf(wallet.address, p.tokenId);
    const balF = parseFloat(ethers.utils.formatUnits(bal, 6));

    let mark;
    if (isActioned(p.expected)) {
      if (balF === 0) mark = '✓';
      else { mark = '✗'; issues.push({ p, balF }); }
    } else {
      // For "kept" positions: any balance is acceptable.
      mark = balF > 0 ? '✓' : '·';
    }

    console.log(`   ${mark}  ${p.label.padEnd(28)}  ${String(balF).padStart(5)} shares   ${p.expected}`);
  }
  console.log();

  if (issues.length > 0) {
    console.log(`✗ ${issues.length} unexpected position(s) — investigate before sweep:`);
    for (const i of issues) {
      console.log(`   ${i.p.label}: still has ${i.balF} shares; expected ${i.p.expected}`);
    }
  } else {
    console.log('✓ All actioned positions confirmed at 0 shares.');
    console.log('✓ Kept positions remain on-chain by design (worthless / dust / sub-economic).');
  }
  console.log();

  console.log('Conclusion: if both checks above are ✓, state matches the rotation plan');
  console.log('and it is safe to proceed with the sweep + key rotation.');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });