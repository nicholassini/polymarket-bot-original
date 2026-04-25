
const { ethers } = require('ethers');
const w = ethers.Wallet.createRandom();

console.log('=== NEW POLYMARKET BOT WALLET ===');
console.log('');
console.log('Address:     ', w.address);
console.log('Private Key: ', w.privateKey);
console.log('Mnemonic:    ', w.mnemonic.phrase);
console.log('');
console.log('=== ACTION ITEMS ===');
console.log('1. Write the mnemonic on PAPER — do NOT save it digitally or in the repo');
console.log('2. Copy the Address — you will send USDC + POL here from Coinbase');
console.log('3. Copy the Private Key — this goes in your .env as POLYMARKET_PRIVATE_KEY');
console.log('4. Delete this script output from your terminal history');