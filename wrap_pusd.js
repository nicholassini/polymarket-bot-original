// wrap_pusd.js — Wrap USDC.e into pUSD via Polymarket CollateralOnramp
// Run after set_allowances_v2.js has approved USDC.e for the onramp.
// Usage: node wrap_pusd.js [amount_in_usdc]
// Example: node wrap_pusd.js 55    (wraps 55 USDC.e into 55 pUSD)
// Example: node wrap_pusd.js       (wraps entire USDC.e balance)

const { ethers } = require('ethers');
require('dotenv').config();

const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://rpc.ankr.com/polygon';
const PRIVATE_KEY = process.env.POLYMARKET_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('❌ POLYMARKET_PRIVATE_KEY not set in .env');
  process.exit(1);
}

// Contract addresses
const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const PUSD = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
const COLLATERAL_ONRAMP = '0x93070a847efEf7F70739046A929D47a521F5B8ee';

// Both USDC.e and pUSD use 6 decimals
const DECIMALS = 6;

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// The CollateralOnramp's wrap function
// Accepts USDC.e (or USDC) and mints pUSD 1:1
const ONRAMP_ABI = [
  'function wrap(uint256 amount)',
];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log('Wallet:', wallet.address);

  const usdce = new ethers.Contract(USDC_E, ERC20_ABI, provider);
  const pusd = new ethers.Contract(PUSD, ERC20_ABI, provider);
  const onramp = new ethers.Contract(COLLATERAL_ONRAMP, ONRAMP_ABI, wallet);

  // Check balances
  const usdceBal = await usdce.balanceOf(wallet.address);
  const pusdBal = await pusd.balanceOf(wallet.address);
  const polBal = await provider.getBalance(wallet.address);

  console.log('USDC.e balance:', ethers.utils.formatUnits(usdceBal, DECIMALS));
  console.log('pUSD balance:', ethers.utils.formatUnits(pusdBal, DECIMALS));
  console.log('POL balance:', ethers.utils.formatEther(polBal));

  if (usdceBal.isZero()) {
    console.error('❌ No USDC.e to wrap.');
    process.exit(1);
  }

  // Determine amount to wrap
  let wrapAmount;
  const arg = process.argv[2];

  if (arg) {
    wrapAmount = ethers.utils.parseUnits(arg, DECIMALS);
    if (wrapAmount.gt(usdceBal)) {
      console.error(`❌ Requested ${arg} USDC.e but only have ${ethers.utils.formatUnits(usdceBal, DECIMALS)}`);
      process.exit(1);
    }
  } else {
    wrapAmount = usdceBal;
    console.log(`No amount specified, wrapping entire balance.`);
  }

  console.log(`\nWrapping ${ethers.utils.formatUnits(wrapAmount, DECIMALS)} USDC.e → pUSD...`);

  // Verify allowance
  const allowance = await usdce.allowance(wallet.address, COLLATERAL_ONRAMP);
  if (allowance.lt(wrapAmount)) {
    console.error('❌ USDC.e not approved for CollateralOnramp. Run set_allowances_v2.js first.');
    process.exit(1);
  }

  // Execute wrap — set gas tip to meet Polygon minimum
  const feeData = await provider.getFeeData();
  const minTip = ethers.utils.parseUnits('35', 'gwei');
  const maxFee = ethers.utils.parseUnits('150', 'gwei');
  const gasOverrides = {
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.gt(minTip) ? feeData.maxPriorityFeePerGas : minTip,
    maxFeePerGas: feeData.maxFeePerGas?.gt(maxFee) ? feeData.maxFeePerGas : maxFee,
  };
  const tx = await onramp.wrap(wrapAmount, gasOverrides);
  console.log('Transaction:', tx.hash);
  console.log('Waiting for confirmation...');

  const receipt = await tx.wait();
  console.log(`✅ Confirmed in block ${receipt.blockNumber} (gas used: ${receipt.gasUsed.toString()})`);

  // Show updated balances
  const newUsdceBal = await usdce.balanceOf(wallet.address);
  const newPusdBal = await pusd.balanceOf(wallet.address);

  console.log('\n--- Updated balances ---');
  console.log('USDC.e:', ethers.utils.formatUnits(newUsdceBal, DECIMALS));
  console.log('pUSD:', ethers.utils.formatUnits(newPusdBal, DECIMALS));
  console.log('\nReady to trade on Polymarket V2.');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});