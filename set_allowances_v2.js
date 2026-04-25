// set_allowances_v2.js — Approve tokens for Polymarket V2 exchange contracts
// Run once, then delete. Requires POL in wallet for gas.
// Usage: node set_allowances_v2.js

const { ethers } = require('ethers');
require('dotenv').config();

const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://rpc.ankr.com/polygon';
const PRIVATE_KEY = process.env.POLYMARKET_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('❌ POLYMARKET_PRIVATE_KEY not set in .env');
  process.exit(1);
}

// Token addresses
const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';     // USDC.e (bridged USDC)
const PUSD = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';       // Polymarket USD
const CTF = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';        // Conditional Token Framework (ERC-1155)

// V2 contract addresses
const CTF_EXCHANGE_V2 = '0xE111180000d2663C0091e4f400237545B87B996B';
const NEG_RISK_CTF_EXCHANGE_V2 = '0xe2222d279d744050d28e00520010520000310F59';
const COLLATERAL_ONRAMP = '0x93070a847efEf7F70739046A929D47a521F5B8ee';

const MAX_UINT256 = ethers.constants.MaxUint256;

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];
const ERC1155_ABI = [
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log('Wallet:', wallet.address);

  const polBalance = await provider.getBalance(wallet.address);
  console.log('POL balance:', ethers.utils.formatEther(polBalance), 'POL');

  if (polBalance.isZero()) {
    console.error('❌ No POL for gas. Send POL to this wallet first.');
    process.exit(1);
  }

  const usdce = new ethers.Contract(USDC_E, ERC20_ABI, wallet);
  const pusd = new ethers.Contract(PUSD, ERC20_ABI, wallet);
  const ctf = new ethers.Contract(CTF, ERC1155_ABI, wallet);

  // Polygon requires a minimum gas tip — fetch current fee data and add buffer
  const feeData = await provider.getFeeData();
  const minTip = ethers.utils.parseUnits('35', 'gwei');
  const maxFee = ethers.utils.parseUnits('150', 'gwei');
  const gasOverrides = {
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.gt(minTip) ? feeData.maxPriorityFeePerGas : minTip,
    maxFeePerGas: feeData.maxFeePerGas?.gt(maxFee) ? feeData.maxFeePerGas : maxFee,
  };
  console.log('Gas tip:', ethers.utils.formatUnits(gasOverrides.maxPriorityFeePerGas, 'gwei'), 'gwei');

  const approvals = [
    // 1. Approve USDC.e for CollateralOnramp (so we can wrap USDC.e -> pUSD)
    {
      label: 'USDC.e → CollateralOnramp',
      check: () => usdce.allowance(wallet.address, COLLATERAL_ONRAMP),
      execute: () => usdce.approve(COLLATERAL_ONRAMP, MAX_UINT256, gasOverrides),
    },
    // 2. Approve pUSD for CTF Exchange V2
    {
      label: 'pUSD → CTF Exchange V2',
      check: () => pusd.allowance(wallet.address, CTF_EXCHANGE_V2),
      execute: () => pusd.approve(CTF_EXCHANGE_V2, MAX_UINT256, gasOverrides),
    },
    // 3. Approve pUSD for Neg Risk CTF Exchange V2
    {
      label: 'pUSD → Neg Risk CTF Exchange V2',
      check: () => pusd.allowance(wallet.address, NEG_RISK_CTF_EXCHANGE_V2),
      execute: () => pusd.approve(NEG_RISK_CTF_EXCHANGE_V2, MAX_UINT256, gasOverrides),
    },
    // 4. Approve CTF (ERC-1155) for CTF Exchange V2
    {
      label: 'CTF → CTF Exchange V2',
      check: () => ctf.isApprovedForAll(wallet.address, CTF_EXCHANGE_V2),
      execute: () => ctf.setApprovalForAll(CTF_EXCHANGE_V2, true, gasOverrides),
    },
    // 5. Approve CTF (ERC-1155) for Neg Risk CTF Exchange V2
    {
      label: 'CTF → Neg Risk CTF Exchange V2',
      check: () => ctf.isApprovedForAll(wallet.address, NEG_RISK_CTF_EXCHANGE_V2),
      execute: () => ctf.setApprovalForAll(NEG_RISK_CTF_EXCHANGE_V2, true, gasOverrides),
    },
  ];

  let skipped = 0;
  let completed = 0;

  for (const approval of approvals) {
    process.stdout.write(`Checking ${approval.label}... `);

    const current = await approval.check();

    // ERC-20 allowance returns a BigNumber, ERC-1155 isApprovedForAll returns bool
    const alreadyApproved =
      typeof current === 'boolean' ? current : current.gt(0);

    if (alreadyApproved) {
      console.log('already approved, skipping');
      skipped++;
      continue;
    }

    process.stdout.write('approving... ');
    const tx = await approval.execute();
    process.stdout.write(`tx ${tx.hash} ... `);
    await tx.wait();
    console.log('✅ confirmed');
    completed++;
  }

  console.log(`\nDone. ${completed} approved, ${skipped} already set.`);
  console.log('You can now wrap USDC.e → pUSD and trade on Polymarket V2.');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});