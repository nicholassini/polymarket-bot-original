require("dotenv").config();
const { ethers } = require("ethers");
const Database = require("better-sqlite3");

const WALLET = "0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935";

async function run() {
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const CTF = new ethers.Contract("0x4D97DCd97eC945f40cF65F87097ACe5EA0476045", [
    "function payoutDenominator(bytes32) view returns (uint256)",
    "function payoutNumerators(bytes32,uint256) view returns (uint256)",
    "function balanceOf(address,uint256) view returns (uint256)"
  ], provider);

  const db = new Database(".runtime/trades.db");
  const positions = db.prepare("SELECT * FROM positions WHERE status='open' ORDER BY id").all();
  db.close();

  console.log("Auditing", positions.length, "open positions...\n");

  const results = [];

  for (const pos of positions) {
    let row = {
      db_id: pos.id,
      market_id: pos.market_id,
      outcome: pos.outcome,
      size: pos.size,
      total_cost: pos.total_cost,
      token_id: pos.token_id,
      clob_closed: null,
      clob_active: null,
      neg_risk: null,
      question: null,
      condition_id: null,
      payoutDenominator: null,
      payoutNum_ours: null,
      our_outcome_index: null,
      onchain_balance: null,
      classification: "UNKNOWN",
      notes: []
    };

    // Step 1: Resolve condition_id (numeric market_ids need Gamma)
    let condition_id = null;
    if (pos.market_id.startsWith("0x")) {
      condition_id = pos.market_id;
    } else {
      // Numeric: use Gamma API
      try {
        const r = await fetch("https://gamma-api.polymarket.com/markets/" + pos.market_id);
        if (r.ok) {
          const d = await r.json();
          condition_id = d.conditionId;
          row.question = d.question;
          row.notes.push("Gamma: " + (d.question || "").slice(0, 60));
        } else {
          row.notes.push("Gamma returned " + r.status);
        }
      } catch (e) {
        row.notes.push("Gamma error: " + e.message);
      }
    }
    row.condition_id = condition_id;

    // Step 2: CLOB market data
    if (condition_id) {
      try {
        const r = await fetch("https://clob.polymarket.com/markets/" + condition_id);
        if (r.ok) {
          const d = await r.json();
          row.clob_closed = d.closed;
          row.clob_active = d.active;
          row.neg_risk    = d.neg_risk;
          row.question    = row.question || d.question;

          // Determine which index is our token
          if (d.tokens && pos.token_id) {
            d.tokens.forEach((t, i) => {
              if (t.token_id === pos.token_id) {
                row.our_outcome_index = i;
              }
            });
          }
        } else {
          row.clob_closed = null;
          row.notes.push("CLOB returned " + r.status);
          row.classification = "ANOMALY";
        }
      } catch (e) {
        row.notes.push("CLOB error: " + e.message);
        row.classification = "ANOMALY";
      }
    }

    // Step 3: On-chain payoutDenominator
    if (condition_id) {
      try {
        const denom = await CTF.payoutDenominator(condition_id);
        row.payoutDenominator = denom.toString();
        if (row.our_outcome_index !== null) {
          const numOurs = await CTF.payoutNumerators(condition_id, row.our_outcome_index);
          row.payoutNum_ours = numOurs.toString();
        }
      } catch (e) {
        row.notes.push("CTF payoutDenominator error: " + e.message);
      }
    }

    // Step 4: On-chain CTF token balance
    if (pos.token_id) {
      try {
        const bal = await CTF.balanceOf(WALLET, pos.token_id);
        row.onchain_balance = ethers.utils.formatUnits(bal, 6);
      } catch (e) {
        row.notes.push("CTF balance error: " + e.message);
      }
    } else {
      row.onchain_balance = "0 (no token_id)";
      row.notes.push("null token_id — was never filled on-chain");
    }

    // Step 5: Classify
    const closed    = row.clob_closed;
    const settled   = row.payoutDenominator && row.payoutDenominator !== "0";
    const bal       = parseFloat(row.onchain_balance) || 0;
    const winnerPay = row.payoutNum_ours === "1";
    const loserPay  = row.payoutNum_ours === "0";

    if (row.classification === "ANOMALY") {
      // already set
    } else if (!closed && !settled) {
      row.classification = "ACTIVE";
    } else if (closed && settled && bal > 0 && winnerPay) {
      row.classification = "RESOLVED_WINNER";
      if (row.neg_risk) row.notes.push("NEG_RISK: do NOT auto-redeem — needs NegRisk Adapter path");
    } else if (closed && settled && loserPay) {
      row.classification = "RESOLVED_LOSER";
    } else if (closed && !settled) {
      row.classification = "RESOLVED_PENDING_ORACLE";
    } else if (!closed && bal === 0 && settled) {
      row.classification = "ANOMALY";
      row.notes.push("Market open but oracle settled and balance=0");
    } else if (bal === 0 && !closed) {
      // market open but no tokens — might be unfilled/anomaly
      row.classification = "ANOMALY";
      row.notes.push("Market open but on-chain balance=0");
    } else {
      row.classification = "ANOMALY";
      row.notes.push("Unclassified state: closed=" + closed + " settled=" + settled + " bal=" + bal);
    }

    results.push(row);
  }

  // Print table
  console.log("| db_id | market_id | outcome | size | clob_closed | clob_active | neg_risk | payoutDenom | onchain_bal | classification | notes |");
  console.log("|-------|-----------|---------|------|-------------|-------------|----------|-------------|-------------|----------------|-------|");
  for (const r of results) {
    const mid = r.market_id.length > 12 ? r.market_id.slice(0, 10) + ".." : r.market_id;
    console.log("| " + [
      r.db_id,
      mid,
      r.outcome.slice(0, 15),
      r.size,
      r.clob_closed,
      r.clob_active,
      r.neg_risk,
      r.payoutDenominator,
      r.onchain_balance,
      r.classification,
      r.notes.join("; ")
    ].join(" | ") + " |");
  }

  // Summary
  console.log("\n=== Classification Summary ===");
  const byClass = {};
  for (const r of results) {
    byClass[r.classification] = (byClass[r.classification] || 0) + 1;
  }
  for (const [k, v] of Object.entries(byClass)) {
    console.log("  " + k + ": " + v);
  }

  // Alert on any non-ACTIVE
  const flagged = results.filter(r => r.classification !== "ACTIVE");
  if (flagged.length > 0) {
    console.log("\n=== FLAGGED (non-ACTIVE) — Manual decision required ===");
    for (const r of flagged) {
      console.log("  db_id=" + r.db_id + " (" + r.outcome + "): " + r.classification + " | " + r.notes.join("; "));
    }
  }

  // Full detail for each result (for report)
  console.log("\n=== Full Detail ===");
  for (const r of results) {
    console.log(JSON.stringify(r, null, 2));
  }
}

run().catch(e => { console.error("FATAL:", e); process.exit(1); });
