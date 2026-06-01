// sweep_to_new_eoa.js
// Step 7 of the rotation plan: drain the leaked-key EOA into the new EOA.
// Sends in order: pUSD → USDC.e → USDC native → POL (last, gas-aware).
// Leaves a small POL buffer on the source so it isn't accidentally bricked.
// Does NOT touch the SWAP phishing airdrop at 0x7525...92C16D34.
//
// Run:
//   node sweep_to_new_eoa.js                   # preview, no txs
//   $env:CONFIRM=1; node sweep_to_new_eoa.js   # actually send (PowerShell)
//   CONFIRM=1 node sweep_to_new_eoa.js         # actually send (bash/zsh)
//
// If a transfer fails partway through, re-run; balances that already moved
// will report 0 and skip cleanly.

require('dotenv').config();
const { ethers } = require('ethers');

// -------- constants --------
const RPC_URL      = 'https://polygon-bor-rpc.publicnode.com';
const EXPECTED_EOA = '0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935';

// Destination — REVIEW THIS CAREFULLY before running with CONFIRM=1.
const DESTINATION  = '0xb279EC1a66e092C96F3836fFb9f6f760CAAD41Ea';

// Leave this much POL on the source EOA so trivial future ops still work.
const POL_BUFFER   = ethers.utils.parseEther('0.1');

// Tokens to sweep, in order.
const TOKENS = [
  { symbol: 'pUSD',   address: '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB' },
  { symbol: 'USDC.e', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
  { symbol: 'USDC',   address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

// -------- gas plumbing (Polygon Bor 25 gwei tip floor) --------
async function gasOverrides(provider) {
  const FLOOR_TIP = ethers.utils.parseUnits('30', 'gwei');
  const feeData = await provider.getFeeData();
  const tip = feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas.gt(FLOOR_TIP)
    ? feeData.maxPriorityFeePerGas : FLOOR_TIP;
  const networkMaxFee = feeData.maxFeePerGas || feeData.gasPrice;
  const minMaxFee = tip.add(ethers.utils.parseUnits('100', 'gwei'));
  const maxFee = networkMaxFee && networkMaxFee.gt(minMaxFee) ? networkMaxFee : minMaxFee;
  return { maxPriorityFeePerGas: tip, maxFeePerGas: maxFee };
}

// -------- main --------
async function main() {
  console.log('=== Sweep to new EOA ===\n');

  const key = process.env.POLYMARKET_PRIVATE_KEY;
  if (!key) { console.error('FATAL: POLYMARKET_PRIVATE_KEY not in .env'); process.exit(1); }

  const provider = new ethers.providers.StaticJsonRpcProvider(
    RPC_URL, { chainId: 137, name: 'polygon' }
  );
  const wallet = new ethers.Wallet(key, provider);

  // --- pre-flight: signer & destination ---
  console.log('source EOA:    ', wallet.address);
  console.log('expected:      ', EXPECTED_EOA);
  if (wallet.address.toLowerCase() !== EXPECTED_EOA.toLowerCase()) {
    console.error('FATAL: signer != expected source EOA. Bailing.');
    process.exit(1);
  }
  console.log('  ✓ matches\n');

  let dest;
  try {
    dest = ethers.utils.getAddress(DESTINATION); // checksum + format check
  } catch (e) {
    console.error('FATAL: DESTINATION is not a valid address:', DESTINATION);
    process.exit(1);
  }
  console.log('┌──────────────────────────────────────────────────────────┐');
  console.log('│ DESTINATION (review carefully):                          │');
  console.log(`│   ${dest}            │`);
  console.log('└──────────────────────────────────────────────────────────┘');
  if (dest.toLowerCase() === wallet.address.toLowerCase()) {
    console.error('FATAL: destination equals source. Bailing.');
    process.exit(1);
  }
  console.log();

  // --- snapshot balances ---
  console.log('Source balances:');
  const tokenSnapshots = [];
  for (const t of TOKENS) {
    const c = new ethers.Contract(t.address, ERC20_ABI, provider);
    const [bal, dec] = await Promise.all([
      c.balanceOf(wallet.address),
      c.decimals(),
    ]);
    const human = ethers.utils.formatUnits(bal, dec);
    console.log(`  ${t.symbol.padEnd(8)} ${human.padStart(15)}   (${t.address})`);
    tokenSnapshots.push({ ...t, contract: c, balance: bal, decimals: dec, human });
  }
  const polBefore = await provider.getBalance(wallet.address);
  console.log(`  POL      ${ethers.utils.formatEther(polBefore).padStart(15)}\n`);

  // --- preview action plan ---
  const fees = await gasOverrides(provider);
  console.log(`gas: ${ethers.utils.formatUnits(fees.maxFeePerGas, 'gwei')} gwei max, `
            + `${ethers.utils.formatUnits(fees.maxPriorityFeePerGas, 'gwei')} gwei tip\n`);

  console.log('Plan:');
  for (const s of tokenSnapshots) {
    if (s.balance.isZero()) console.log(`  skip ${s.symbol} (0 balance)`);
    else console.log(`  send ${s.human} ${s.symbol} → ${dest}`);
  }
  // POL: estimate cost of native send (21000 gas), reserve buffer
  const polTransferGas = ethers.BigNumber.from(21000);
  const polTransferCost = polTransferGas.mul(fees.maxFeePerGas);
  // We'll re-compute the actual POL amount after ERC-20 sends complete,
  // but display an estimate now (assumes ~80k gas per ERC-20 transfer).
  const erc20EstGas = ethers.BigNumber.from(80_000);
  const nonZero = tokenSnapshots.filter(s => !s.balance.isZero()).length;
  const erc20EstCost = erc20EstGas.mul(fees.maxFeePerGas).mul(nonZero);
  const polEst = polBefore.sub(erc20EstCost).sub(polTransferCost).sub(POL_BUFFER);
  console.log(`  send ~${ethers.utils.formatEther(polEst.gt(0) ? polEst : ethers.constants.Zero)} POL → ${dest}`);
  console.log(`        (after ERC-20 gas, after ${ethers.utils.formatEther(POL_BUFFER)} POL buffer; computed exactly at send time)\n`);

  if (process.env.CONFIRM !== '1') {
    console.log('CONFIRM != 1 — preview only. Re-run to actually send:');
    console.log('  PowerShell:  $env:CONFIRM=1; node sweep_to_new_eoa.js');
    console.log('  bash/zsh:    CONFIRM=1 node sweep_to_new_eoa.js');
    return;
  }

  // --- execute ERC-20 transfers ---
  console.log('Sending...\n');
  for (const s of tokenSnapshots) {
    if (s.balance.isZero()) {
      console.log(`[${s.symbol}] skip (0 balance)`);
      continue;
    }
    const cWithSigner = s.contract.connect(wallet);
    let gasLimit;
    try {
      const est = await cWithSigner.estimateGas.transfer(dest, s.balance);
      gasLimit = est.mul(120).div(100);
    } catch (e) {
      console.error(`[${s.symbol}] gas estimate failed: ${e.reason || e.message}`);
      process.exit(1);
    }

    console.log(`[${s.symbol}] sending ${s.human}`);
    const tx = await cWithSigner.transfer(dest, s.balance, { ...fees, gasLimit });
    console.log(`  hash:  ${tx.hash}`);
    const rcpt = await tx.wait();
    console.log(`  block: ${rcpt.blockNumber}, gas used: ${rcpt.gasUsed.toString()}, status: ${rcpt.status === 1 ? '✓' : '✗ FAILED'}`);
    if (rcpt.status !== 1) { console.error('Aborting on failed transfer.'); process.exit(1); }

    const after = await s.contract.balanceOf(wallet.address);
    console.log(`  source ${s.symbol} balance after: ${ethers.utils.formatUnits(after, s.decimals)}\n`);
  }

  // --- POL: compute exact amount and send ---
  console.log('[POL] computing exact send amount...');
  // Refresh gas data — base fee may have moved during the ERC-20 sends.
  const polFees = await gasOverrides(provider);
  const polNow = await provider.getBalance(wallet.address);
  const polCost = ethers.BigNumber.from(21000).mul(polFees.maxFeePerGas);
  const polSend = polNow.sub(polCost).sub(POL_BUFFER);
  console.log(`  current POL:    ${ethers.utils.formatEther(polNow)}`);
  console.log(`  reserve buffer: ${ethers.utils.formatEther(POL_BUFFER)}`);
  console.log(`  reserve gas:    ${ethers.utils.formatEther(polCost)}`);
  console.log(`  send amount:    ${ethers.utils.formatEther(polSend.gt(0) ? polSend : ethers.constants.Zero)}`);

  if (polSend.lte(0)) {
    console.log('  ✗ nothing left after buffer + gas; skipping POL send.');
  } else {
    const tx = await wallet.sendTransaction({
      to: dest,
      value: polSend,
      gasLimit: 21000,
      ...polFees,
    });
    console.log(`  hash:  ${tx.hash}`);
    const rcpt = await tx.wait();
    console.log(`  block: ${rcpt.blockNumber}, status: ${rcpt.status === 1 ? '✓' : '✗ FAILED'}`);
  }

  // --- final post-sweep summary ---
  console.log('\n=== Final balances ===\n');
  console.log('SOURCE  ' + wallet.address);
  for (const t of TOKENS) {
    const c = new ethers.Contract(t.address, ERC20_ABI, provider);
    const bal = await c.balanceOf(wallet.address);
    const dec = await c.decimals();
    console.log(`  ${t.symbol.padEnd(8)} ${ethers.utils.formatUnits(bal, dec)}`);
  }
  console.log(`  POL      ${ethers.utils.formatEther(await provider.getBalance(wallet.address))}\n`);

  console.log('DEST    ' + dest);
  for (const t of TOKENS) {
    const c = new ethers.Contract(t.address, ERC20_ABI, provider);
    const bal = await c.balanceOf(dest);
    const dec = await c.decimals();
    console.log(`  ${t.symbol.padEnd(8)} ${ethers.utils.formatUnits(bal, dec)}`);
  }
  console.log(`  POL      ${ethers.utils.formatEther(await provider.getBalance(dest))}\n`);

  console.log('Done.');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });