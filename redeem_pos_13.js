// redeem_pos13.js
// Redeems position 13 (BTC > $76k April 29, NO outcome) on the CTF.
// NO won → settles ~5 USDC.e to the EOA.
//
// Run from project root:
//   node redeem_pos13.js                  # preview only, no tx sent
//   CONFIRM=1 node redeem_pos13.js        # actually send (bash/zsh)
//   $env:CONFIRM=1; node redeem_pos13.js  # actually send (PowerShell)
//
// Signs with POLYMARKET_PRIVATE_KEY from .env (the leaked key — fine here,
// rotation comes after we extract value).
// Pre-flight checks:
//   1. signer address matches expected EOA
//   2. condition is resolved on-chain
//   3. NO is the winning outcome
//   4. EOA actually holds NO shares
//   5. gas can be estimated (i.e. tx wouldn't revert)

require('dotenv').config();
const { ethers } = require('ethers');

// ---------- constants ----------
const RPC_URL       = 'https://polygon-bor-rpc.publicnode.com';
const CTF           = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_E        = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const EXPECTED_EOA  = '0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935';

// Position 13 specifics (from handoff)
const CONDITION_ID         = '0xa70b24891ed3b6d2daf4648be7fef1da5432749995d39e95bb2a46c4d7951c4f';
const PARENT_COLLECTION_ID = ethers.constants.HashZero;
const INDEX_SET_NO         = 2;     // NO = outcome idx 1, indexSet = 1 << 1 = 2
const EXPECTED_PAYOUT      = '~5.0 USDC.e';

const CTF_ABI = [
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external',
  'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
  'function getPositionId(address collateralToken, bytes32 collectionId) view returns (uint256)',
  'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
  'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
  'event PayoutRedemption(address indexed redeemer, address indexed collateralToken, bytes32 indexed parentCollectionId, bytes32 conditionId, uint256[] indexSets, uint256 payout)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

// ---------- main ----------
async function main() {
  console.log('=== Polymarket pos 13 redemption ===\n');

  const key = process.env.POLYMARKET_PRIVATE_KEY;
  if (!key) {
    console.error('FATAL: POLYMARKET_PRIVATE_KEY not in .env');
    process.exit(1);
  }

  const provider = new ethers.providers.StaticJsonRpcProvider(
    RPC_URL,
    { chainId: 137, name: 'polygon' }
  );
  const wallet = new ethers.Wallet(key, provider);

  console.log('signer:        ', wallet.address);
  console.log('expected EOA:  ', EXPECTED_EOA);
  if (wallet.address.toLowerCase() !== EXPECTED_EOA.toLowerCase()) {
    console.error('\nFATAL: signer does not match expected EOA. Bailing.');
    process.exit(1);
  }
  console.log('  ✓ matches\n');

  const ctf   = new ethers.Contract(CTF,    CTF_ABI,   wallet);
  const usdce = new ethers.Contract(USDC_E, ERC20_ABI, provider);

  // --- 1. condition resolution ---
  console.log('Checking condition resolution...');
  console.log('  conditionId:   ', CONDITION_ID);
  const denom = await ctf.payoutDenominator(CONDITION_ID);
  if (denom.isZero()) {
    console.error('  FATAL: condition not resolved (denominator = 0)');
    process.exit(1);
  }
  const numYes = await ctf.payoutNumerators(CONDITION_ID, 0);
  const numNo  = await ctf.payoutNumerators(CONDITION_ID, 1);
  console.log(`  denominator:    ${denom.toString()}`);
  console.log(`  YES numerator:  ${numYes.toString()}`);
  console.log(`  NO  numerator:  ${numNo.toString()}`);
  if (numNo.isZero()) {
    console.error('  FATAL: NO did not win — nothing to redeem.');
    process.exit(1);
  }
  console.log('  ✓ NO won\n');

  // --- 2. position id + balance ---
  console.log('Computing positionId and checking balance...');
  const collectionId = await ctf.getCollectionId(PARENT_COLLECTION_ID, CONDITION_ID, INDEX_SET_NO);
  const positionId   = await ctf.getPositionId(USDC_E, collectionId);
  console.log('  collectionId:  ', collectionId);
  console.log('  positionId:    ', positionId.toString());

  const shares = await ctf.balanceOf(wallet.address, positionId);
  console.log(`  NO shares:      ${ethers.utils.formatUnits(shares, 6)} (raw ${shares.toString()})`);
  if (shares.isZero()) {
    console.error('  FATAL: zero shares — already redeemed, or wrong tokenId.');
    process.exit(1);
  }
  console.log('  ✓ shares present\n');

  // --- 3. pre-tx balances ---
  const usdceBefore = await usdce.balanceOf(wallet.address);
  const polBefore   = await provider.getBalance(wallet.address);
  console.log('Balances before:');
  console.log(`  USDC.e:         ${ethers.utils.formatUnits(usdceBefore, 6)}`);
  console.log(`  POL:            ${ethers.utils.formatEther(polBefore)}\n`);

  // --- 4. gas estimate ---
  console.log('Estimating gas...');
  let gasLimit;
  try {
    const est = await ctf.estimateGas.redeemPositions(
      USDC_E, PARENT_COLLECTION_ID, CONDITION_ID, [INDEX_SET_NO]
    );
    gasLimit = est.mul(120).div(100); // +20% buffer
    console.log(`  estimate:       ${est.toString()}`);
    console.log(`  with buffer:    ${gasLimit.toString()}`);
  } catch (e) {
    console.error('  FATAL: gas estimation failed (would-revert):', e.reason || e.message);
    process.exit(1);
  }

  // Polygon Bor enforces a 25 gwei minimum priority fee; ethers' default
  // of 1.5 gwei gets rejected with "gas tip cap below minimum".
  const feeData = await provider.getFeeData();
  const FLOOR_TIP = ethers.utils.parseUnits('30', 'gwei');
  const maxPriorityFeePerGas =
    feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas.gt(FLOOR_TIP)
      ? feeData.maxPriorityFeePerGas
      : FLOOR_TIP;
  // maxFeePerGas needs headroom above tip for the base fee.
  const networkMaxFee = feeData.maxFeePerGas || feeData.gasPrice;
  const minMaxFee = maxPriorityFeePerGas.add(ethers.utils.parseUnits('100', 'gwei'));
  const maxFeePerGas =
    networkMaxFee && networkMaxFee.gt(minMaxFee) ? networkMaxFee : minMaxFee;
  console.log(`  maxFeePerGas:   ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} gwei`);
  console.log(`  priority fee:   ${ethers.utils.formatUnits(maxPriorityFeePerGas, 'gwei')} gwei`);
  console.log(`  worst-case:     ${ethers.utils.formatEther(gasLimit.mul(maxFeePerGas))} POL\n`);

  // --- 5. summary + confirm gate ---
  console.log('=== About to send ===');
  console.log(`  call:           CTF.redeemPositions`);
  console.log(`  collateral:     ${USDC_E} (USDC.e)`);
  console.log(`  parent:         ${PARENT_COLLECTION_ID}`);
  console.log(`  condition:      ${CONDITION_ID}`);
  console.log(`  indexSets:      [${INDEX_SET_NO}]   (NO outcome)`);
  console.log(`  expected payout: ${EXPECTED_PAYOUT}\n`);

  if (process.env.CONFIRM !== '1') {
    console.log('CONFIRM != 1 — preview only. Re-run to actually send:');
    console.log('  bash/zsh:    CONFIRM=1 node redeem_pos13.js');
    console.log('  PowerShell:  $env:CONFIRM=1; node redeem_pos13.js');
    return;
  }

  // --- 6. send ---
  console.log('Sending tx...');
  const tx = await ctf.redeemPositions(
    USDC_E, PARENT_COLLECTION_ID, CONDITION_ID, [INDEX_SET_NO],
    { gasLimit, maxFeePerGas, maxPriorityFeePerGas }
  );
  console.log(`  hash:           ${tx.hash}`);
  console.log(`  polygonscan:    https://polygonscan.com/tx/${tx.hash}`);
  console.log(`  waiting for confirmation...`);
  const rcpt = await tx.wait();
  console.log(`  block:          ${rcpt.blockNumber}`);
  console.log(`  status:         ${rcpt.status === 1 ? 'success' : 'FAILED'}`);
  console.log(`  gas used:       ${rcpt.gasUsed.toString()}\n`);

  // --- 7. parse PayoutRedemption event ---
  for (const log of rcpt.logs) {
    try {
      const parsed = ctf.interface.parseLog(log);
      if (parsed.name === 'PayoutRedemption') {
        console.log(`  PayoutRedemption: ${ethers.utils.formatUnits(parsed.args.payout, 6)} USDC.e`);
      }
    } catch { /* not a CTF event */ }
  }

  // --- 8. post-tx balances ---
  const usdceAfter  = await usdce.balanceOf(wallet.address);
  const polAfter    = await provider.getBalance(wallet.address);
  const sharesAfter = await ctf.balanceOf(wallet.address, positionId);
  console.log('\nBalances after:');
  console.log(`  USDC.e:         ${ethers.utils.formatUnits(usdceAfter, 6)}  (Δ +${ethers.utils.formatUnits(usdceAfter.sub(usdceBefore), 6)})`);
  console.log(`  POL:            ${ethers.utils.formatEther(polAfter)}  (Δ -${ethers.utils.formatEther(polBefore.sub(polAfter))})`);
  console.log(`  NO shares:      ${ethers.utils.formatUnits(sharesAfter, 6)}  (was ${ethers.utils.formatUnits(shares, 6)})\n`);

  console.log('Done.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});