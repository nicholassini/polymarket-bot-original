const Database = require("better-sqlite3");
const db = new Database(".runtime/trades.db");

async function backfill() {
  const broken = db.prepare(
    "SELECT id, order_id, market_id, outcome FROM trades WHERE token_id IS NULL"
  ).all();
  console.log("Remaining broken:", broken.length);

  const updateTrade = db.prepare("UPDATE trades SET token_id = ? WHERE id = ?");
  const updatePos = db.prepare(
    "UPDATE positions SET token_id = ? WHERE market_id = ? AND outcome = ? AND token_id IS NULL"
  );

  for (const t of broken) {
    console.log("\n--- Trade #" + t.id + " order=" + t.order_id + " market=" + t.market_id);

    // Try 1: CLOB order endpoint (full order ID)
    try {
      const r = await fetch("https://clob.polymarket.com/order/" + t.order_id);
      if (r.ok) {
        const d = await r.json();
        console.log("  CLOB order response keys:", Object.keys(d).join(", "));
        const tok = d.asset_id || d.token_id || d.tokenID;
        if (tok) {
          updateTrade.run(tok, t.id);
          updatePos.run(tok, t.market_id, t.outcome);
          console.log("  FIXED via /order/:", tok.slice(0,30) + "...");
          continue;
        }
      } else {
        console.log("  /order/ returned", r.status);
      }
    } catch(e) { console.log("  /order/ error:", e.message); }

    // Try 2: CLOB market endpoint (numeric ID)
    try {
      const r = await fetch("https://clob.polymarket.com/markets/" + t.market_id);
      if (r.ok) {
        const d = await r.json();
        console.log("  CLOB market keys:", Object.keys(d).join(", "));
        const tokens = d.tokens || [];
        console.log("  tokens:", JSON.stringify(tokens.map(x => ({o: x.outcome, t: (x.token_id||"").slice(0,20)}))));
        const match = tokens.find(x => (x.outcome||"").toUpperCase() === t.outcome.toUpperCase());
        if (match && match.token_id) {
          updateTrade.run(match.token_id, t.id);
          updatePos.run(match.token_id, t.market_id, t.outcome);
          console.log("  FIXED via /markets/:", match.token_id.slice(0,30) + "...");
          continue;
        }
      } else {
        console.log("  /markets/ returned", r.status);
      }
    } catch(e) { console.log("  /markets/ error:", e.message); }

    // Try 3: Gamma with clob_token_ids search (slug-based)
    try {
      const r = await fetch("https://gamma-api.polymarket.com/markets?closed=false&limit=1&id=" + t.market_id);
      if (r.ok) {
        const d = await r.json();
        if (d.length > 0) {
          console.log("  Gamma found:", d[0].question?.slice(0,50));
          const outcomes = d[0].outcomes ? JSON.parse(d[0].outcomes) : [];
          const clobIds = d[0].clobTokenIds ? JSON.parse(d[0].clobTokenIds) : [];
          console.log("  outcomes:", outcomes, "clobIds:", clobIds.map(x => x.slice(0,20)));
          const idx = outcomes.findIndex(o => o.toUpperCase() === t.outcome.toUpperCase());
          if (idx >= 0 && clobIds[idx]) {
            updateTrade.run(clobIds[idx], t.id);
            updatePos.run(clobIds[idx], t.market_id, t.outcome);
            console.log("  FIXED via Gamma:", clobIds[idx].slice(0,30) + "...");
            continue;
          }
        } else {
          console.log("  Gamma: no results for id=" + t.market_id);
        }
      }
    } catch(e) { console.log("  Gamma error:", e.message); }

    console.log("  STILL BROKEN");
  }

  const left = db.prepare("SELECT COUNT(*) as c FROM positions WHERE token_id IS NULL AND status='open'").get();
  console.log("\nRemaining NULL positions:", left.c);
}

backfill().catch(console.error);
