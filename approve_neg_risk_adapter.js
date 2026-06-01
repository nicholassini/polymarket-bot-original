// approve_negrisk_adapter.js
// One-shot: approves CTF.setApprovalForAll(NEG_RISK_ADAPTER, true).
// Required for SELLS on negRisk markets; the bot only ever bought on those,
// so this approval was never set. set_allowances_v2.js missed it.
//
// Run:
//   node approve_negrisk_adapter.js              # preview only
//   $env:CONFIRM=1; node approve_negrisk_adapter.js   # send (PowerShell)
//   CONFIRM=1 node approve_negrisk_adapter.js    # send (bash/zsh)
//
// After this lands, re-run sell_positions.js — pos 3 and the River Plate
// orphan should fill.
//
// Verified against Polymarket's official addresses.json:
//   "negRiskAdapter": "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296"

require('dotenv').config();
const { ethers } = require('ethers');

const RPC_URL          = 'https://polygon-bor-rpc.publicnode.com';
const CTF              = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';
const EXPECTED_EOA     = '0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935';

const ABI = [
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
];

async function main() {
  console.log('=== Approve CTF → NegRiskAdapter ===\n');

  const key = process.env.POLYMARKET_PRIVATE_KEY;
  if (!key) { console.error('FATAL: POLYMARKET_PRIVATE_KEY not in .env'); process.exit(1); }

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

  const ctf = new ethers.Contract(CTF, ABI, wallet);

  // --- already approved? ---
  const already = await ctf.isApprovedForAll(wallet.address, NEG_RISK_ADAPTER);
  console.log(`Current approval: ${already ? '✓ already approved — nothing to do' : '✗ not approved'}`);
  if (already) return;
  console.log();

  // --- gas + fee plumbing (Polygon Bor 25 gwei tip floor) ---
  const FLOOR_TIP = ethers.utils.parseUnits('30', 'gwei');
  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas =
    feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas.gt(FLOOR_TIP)
      ? feeData.maxPriorityFeePerGas : FLOOR_TIP;
  const networkMaxFee = feeData.maxFeePerGas || feeData.gasPrice;
  const minMaxFee = maxPriorityFeePerGas.add(ethers.utils.parseUnits('100', 'gwei'));
  const maxFeePerGas =
    networkMaxFee && networkMaxFee.gt(minMaxFee) ? networkMaxFee : minMaxFee;

  let gasLimit;
  try {
    const est = await ctf.estimateGas.setApprovalForAll(NEG_RISK_ADAPTER, true);
    gasLimit = est.mul(120).div(100);
    console.log(`Gas estimate:   ${est.toString()}`);
    console.log(`Gas limit:      ${gasLimit.toString()}`);
  } catch (e) {
    console.error('FATAL: gas estimation failed:', e.reason || e.message);
    process.exit(1);
  }

  console.log(`maxFeePerGas:   ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} gwei`);
  console.log(`priority fee:   ${ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei')} gwei`);
  console.log(`worst-case:     ${ethers.utils.formatEther(gasLimit.mul(maxFeePerGas))} POL`);

  const polBefore = await provider.getBalance(wallet.address);
  console.log(`POL balance:    ${ethers.utils.formatEther(polBefore)}\n`);

  console.log('=== About to send ===');
  console.log(`  call:    CTF.setApprovalForAll(${NEG_RISK_ADAPTER}, true)\n`);

  if (process.env.CONFIRM !== '1') {
    console.log('CONFIRM != 1 — preview only. Re-run to actually send:');
    console.log('  PowerShell:  $env:CONFIRM=1; node approve_negrisk_adapter.js');
    console.log('  bash/zsh:    CONFIRM=1 node approve_negrisk_adapter.js');
    return;
  }

  console.log('Sending tx...');
  const tx = await ctf.setApprovalForAll(NEG_RISK_ADAPTER, true, {
    gasLimit, maxFeePerGas, maxPriorityFeePerGas,
  });
  console.log(`  hash:        ${tx.hash}`);
  console.log(`  polygonscan: https://polygonscan.com/tx/${tx.hash}`);
  console.log(`  waiting for confirmation...`);
  const rcpt = await tx.wait();
  console.log(`  block:       ${rcpt.blockNumber}`);
  console.log(`  status:      ${rcpt.status === 1 ? 'success' : 'FAILED'}`);
  console.log(`  gas used:    ${rcpt.gasUsed.toString()}`);

  // --- verify ---
  const after = await ctf.isApprovedForAll(wallet.address, NEG_RISK_ADAPTER);
  console.log(`\nApproval after: ${after ? '✓ approved' : '✗ STILL NOT APPROVED — investigate'}`);

  console.log('\nDone. Now re-run: $env:CONFIRM=1; node sell_positions.js');
  console.log('to retry pos 3 and the River Plate orphan.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});