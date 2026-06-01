/**
 * Backfill token_ids for the 6 broken positions.
 * 
 * Queries the CLOB API for each order to get the correct token_id,
 * then UPDATEs both the trades and positions tables.
 *
 * USAGE: node backfill_tokens.js
 * Run AFTER applying the patches (fix_token_id.js) but BEFORE restarting the bot.
 */

const Database = require("better-sqlite3");

const db = new Database(".runtime/trades.db");

async function backfill() {
  // Find all trades with NULL token_id
  const broken_trades = db.prepare(
    "SELECT id, order_id, market_id, outcome FROM trades WHERE token_id IS NULL"
  ).all();

  console.log(`Found ${broken_trades.length} trades with NULL token_id\n`);

  const updateTrade = db.prepare("UPDATE trades SET token_id = ? WHERE id = ?");
  const updatePosition = db.prepare(
    "UPDATE positions SET token_id = ? WHERE market_id = ? AND outcome = ? AND token_id IS NULL"
  );

  let fixed = 0;

  for (const trade of broken_trades) {
    console.log(`--- Trade #${trade.id}: order=${trade.order_id.slice(0,16)}... market=${trade.market_id}`);
    
    try {
      // Method 1: Query CLOB order endpoint to get asset_id (token_id)
      const orderUrl = `https://clob.polymarket.com/order/${trade.order_id}`;
      const orderResp = await fetch(orderUrl);
      
      if (orderResp.ok) {
        const orderData = await orderResp.json();
        const tokenId = orderData.asset_id || orderData.token_id;
        
        if (tokenId) {
          updateTrade.run(tokenId, trade.id);
          const posResult = updatePosition.run(tokenId, trade.market_id, trade.outcome);
          console.log(`  ✅ Fixed via order endpoint: token=${tokenId.slice(0,30)}...`);
          console.log(`     Updated trade #${trade.id}, ${posResult.changes} position(s)`);
          fixed++;
          continue;
        }
      }

      // Method 2: Query CLOB market endpoint to get token IDs by outcome
      const marketUrl = `https://clob.polymarket.com/markets/${trade.market_id}`;
      const marketResp = await fetch(marketUrl);
      
      if (marketResp.ok) {
        const marketData = await marketResp.json();
        const tokens = marketData.tokens || [];
        
        // Match outcome to token
        const outcomeUpper = trade.outcome.toUpperCase();
        const matchedToken = tokens.find(t => 
          (t.outcome || "").toUpperCase() === outcomeUpper
        );
        
        if (matchedToken) {
          const tokenId = matchedToken.token_id;
          updateTrade.run(tokenId, trade.id);
          const posResult = updatePosition.run(tokenId, trade.market_id, trade.outcome);
          console.log(`  ✅ Fixed via market endpoint: token=${tokenId.slice(0,30)}...`);
          console.log(`     Updated trade #${trade.id}, ${posResult.changes} position(s)`);
          fixed++;
          continue;
        }
      }

      // Method 3: Try Gamma API
      const gammaUrl = `https://gamma-api.polymarket.com/markets?id=${trade.market_id}`;
      const gammaResp = await fetch(gammaUrl);
      
      if (gammaResp.ok) {
        const gammaData = await gammaResp.json();
        if (gammaData.length > 0) {
          const market = gammaData[0];
          // Gamma uses clobTokenIds array corresponding to outcomes array
          const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];
          const clobTokenIds = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : [];
          
          const idx = outcomes.findIndex(o => o.toUpperCase() === trade.outcome.toUpperCase());
          if (idx >= 0 && clobTokenIds[idx]) {
            const tokenId = clobTokenIds[idx];
            updateTrade.run(tokenId, trade.id);
            const posResult = updatePosition.run(tokenId, trade.market_id, trade.outcome);
            console.log(`  ✅ Fixed via Gamma API: token=${tokenId.slice(0,30)}...`);
            console.log(`     Updated trade #${trade.id}, ${posResult.changes} position(s)`);
            fixed++;
            continue;
          }
        }
      }

      console.log(`  ❌ Could not resolve token_id for this trade`);
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
  }

  console.log(`\n=== Done: fixed ${fixed}/${broken_trades.length} trades ===`);

  // Verify
  const remaining = db.prepare(
    "SELECT COUNT(*) as c FROM positions WHERE token_id IS NULL AND status = 'open'"
  ).get();
  console.log(`Remaining open positions with NULL token_id: ${remaining.c}`);
}

backfill().catch(console.error);
