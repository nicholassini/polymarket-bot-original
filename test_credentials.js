// test_credentials.js — Verify CLOB V2 auth works with your wallet
require('dotenv').config();
const { Wallet } = require('ethers');

async function main() {
  const pk = process.env.POLYMARKET_PRIVATE_KEY;
  if (!pk) {
    console.error('❌ POLYMARKET_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  // Dynamic import — same as your clob_sdk.ts
  const sdk = await import('@polymarket/clob-client-v2');
  const ClobClient = sdk.ClobClient;
  const Chain = sdk.Chain;

  const wallet = new Wallet(pk);
  const signer = wallet;
  const host = process.env.POLYMARKET_CLOB_API || 'https://clob.polymarket.com';

  console.log('Wallet address:', wallet.address);
  console.log('Host:', host);

  // Step 1: Derive creds (mirrors _init() in clob_client.ts)
  console.log('\nDeriving API credentials...');
  const tempClient = new ClobClient({ host, chain: Chain.POLYGON, signer });
  const creds = await tempClient.createOrDeriveApiKey();
  console.log('✅ API Key:       ', creds.key);
  console.log('✅ API Secret:    ', creds.secret ? '(set)' : '(empty!)');
  console.log('✅ Passphrase:    ', creds.passphrase ? '(set)' : '(empty!)');

  // Step 2: Authenticated client (mirrors _init() in clob_client.ts)
  const client = new ClobClient({
    host,
    chain: Chain.POLYGON,
    signer,
    creds,
    funderAddress: wallet.address,
  });

  // Step 3: Test authenticated read
  console.log('\nTesting authenticated endpoints...');
  const openOrders = await client.getOpenOrders();
  console.log('✅ Open orders:', Array.isArray(openOrders) ? openOrders.length : 0);

  console.log('\n=== ALL CHECKS PASSED — READY FOR LIVE ===');
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});