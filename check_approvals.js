// check_approvals.js — read-only audit of CTF + ERC-20 approvals on the new EOA.
// All 6 approvals must be set before the bot can buy or sell.
// 5 from set_allowances_v2.js (buy-side) + 1 negRisk adapter (sell-side, discovered during cleanup).

require('dotenv').config();
const { ethers } = require('ethers');

const RPC_URL  = 'https://polygon-bor-rpc.publicnode.com';
const NEW_EOA  = '0xb279EC1a66e092C96F3836fFb9f6f760CAAD41Ea';

// Token contracts
const USDC_E   = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const PUSD     = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
const CTF      = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

// Spender contracts
const COLLATERAL_ONRAMP        = '0x93070a847efEf7F70739046A929D47a521F5B8ee';
const CTF_EXCHANGE_V2          = '0xE111180000d2663C0091e4f400237545B87B996B';
const NEG_RISK_CTF_EXCHANGE_V2 = '0xe2222d279d744050d28e00520010520000310F59';
const NEG_RISK_ADAPTER         = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

const ERC20_ABI = ['function allowance(address owner, address spender) view returns (uint256)'];
const ERC1155_ABI = ['function isApprovedForAll(address account, address operator) view returns (bool)'];

const APPROVALS = [
  // Buy-side (from set_allowances_v2.js)
  { kind: 'erc20',   token: USDC_E, spender: COLLATERAL_ONRAMP,        label: 'USDC.e → CollateralOnramp',         purpose: 'wrap USDC.e → pUSD before buying' },
  { kind: 'erc20',   token: PUSD,   spender: CTF_EXCHANGE_V2,          label: 'pUSD → CTF Exchange V2',            purpose: 'spend pUSD on regular markets' },
  { kind: 'erc20',   token: PUSD,   spender: NEG_RISK_CTF_EXCHANGE_V2, label: 'pUSD → Neg Risk Exchange V2',       purpose: 'spend pUSD on negRisk markets' },
  { kind: 'erc1155', token: CTF,    spender: CTF_EXCHANGE_V2,          label: 'CTF → CTF Exchange V2',             purpose: 'sell shares on regular markets' },
  { kind: 'erc1155', token: CTF,    spender: NEG_RISK_CTF_EXCHANGE_V2, label: 'CTF → Neg Risk Exchange V2',        purpose: 'sell shares on negRisk markets (matching)' },
  // Sell-side gap discovered during cleanup
  { kind: 'erc1155', token: CTF,    spender: NEG_RISK_ADAPTER,         label: 'CTF → NegRiskAdapter',              purpose: 'sell shares on negRisk markets (settlement)' },
];

async function main() {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    RPC_URL, { chainId: 137, name: 'polygon' }
  );

  console.log('=== Approval audit ===\n');
  console.log('EOA:', NEW_EOA, '\n');

  const results = [];
  for (const a of APPROVALS) {
    let ok, value;
    if (a.kind === 'erc20') {
      const c = new ethers.Contract(a.token, ERC20_ABI, provider);
      const allow = await c.allowance(NEW_EOA, a.spender);
      ok = allow.gt(0);
      value = ok ? (allow.eq(ethers.constants.MaxUint256) ? 'MAX' : allow.toString()) : '0';
    } else {
      const c = new ethers.Contract(a.token, ERC1155_ABI, provider);
      ok = await c.isApprovedForAll(NEW_EOA, a.spender);
      value = ok ? 'true' : 'false';
    }
    results.push({ ...a, ok, value });
    console.log(`  ${ok ? '✓' : '✗'}  ${a.label.padEnd(38)} (${a.kind})  ${value}`);
    console.log(`     purpose: ${a.purpose}`);
  }

  const missing = results.filter(r => !r.ok);
  console.log();
  if (missing.length === 0) {
    console.log('✓ All 6 approvals set. The bot can buy AND sell on both regular and negRisk markets.');
  } else {
    console.log(`✗ ${missing.length}/${APPROVALS.length} approvals missing:`);
    for (const m of missing) {
      console.log(`    ${m.label}  —  ${m.purpose}`);
    }
    console.log();
    console.log('To fix: run set_allowances_v2.js (covers 5) and approve_neg_risk_adapter.js (covers 1)');
    console.log('from the new EOA. Both already work — just re-run with the new key in .env.');
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });