/**
 * op8_probe_v2.js — Alternative collateral confirmation for position #8
 *
 * The primary RPC (publicnode.com) is a pruned node and cannot serve
 * eth_getLogs for blocks from May 2025 (market creation). This script
 * uses multiple fallback strategies:
 *
 *  A. Read trades table — get tx_hash from the original fill, then
 *     fetch the receipt (pruned nodes keep receipts for recent txs).
 *     Parse PositionSplit or Transfer events from that receipt.
 *  B. Polygonscan API (no key) — getLogs for PositionSplit with conditionId.
 *  C. Alternate archive-capable Polygon RPCs — try Ankr, Blast.
 *  D. CLOB trade history API — get tx from Polymarket's API.
 *
 * READ-ONLY. No transactions.
 */
require("dotenv").config();
const Database = require("better-sqlite3");
const { ethers } = require("ethers");
const path = require("path");

const WALLET      = "0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935";
const CTF_ADDR    = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const PUSD_ADDR   = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDCE_ADDR  = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CONDITION_ID = "0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e";
const DB_PATH     = path.join(__dirname, ".runtime", "trades.db");

const POSITION_SPLIT_SIG   = "PositionSplit(address,address,bytes32,bytes32,uint256[],uint256)";
const POSITION_SPLIT_TOPIC = ethers.utils.id(POSITION_SPLIT_SIG);
const PAYOUT_REDEMPTION_SIG = "PayoutRedemption(address,address,bytes32,bytes32,uint256[],uint256)";
const PAYOUT_REDEMPTION_TOPIC = ethers.utils.id(PAYOUT_REDEMPTION_SIG);

// Transfer(address,address,uint256) topic — for ERC20 flows
const TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");
// TransferBatch/TransferSingle for ERC1155
const TRANSFER_SINGLE_TOPIC = ethers.utils.id("TransferSingle(address,address,address,uint256,uint256)");

const iface = new ethers.utils.Interface([
  `event PositionSplit(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)`,
  `event PayoutRedemption(address indexed redeemer, address indexed collateralToken, bytes32 indexed parentCollectionId, bytes32 conditionId, uint256[] indexSets, uint256 payout)`,
]);

const conditionIdPadded = ethers.utils.hexZeroPad(CONDITION_ID, 32);

const ALTERNATE_RPCS = [
  "https://rpc.ankr.com/polygon",
  "https://polygon-mainnet.public.blastapi.io",
  "https://polygon.drpc.org",
];

async function tryGetLogs(provider, rpcName, fromBlock, toBlock) {
  try {
    console.log(`  [${rpcName}] Trying getLogs blocks ${fromBlock}–${toBlock}...`);
    const logs = await provider.getLogs({
      address: CTF_ADDR,
      topics: [POSITION_SPLIT_TOPIC, null, null, conditionIdPadded],
      fromBlock,
      toBlock,
    });
    console.log(`  [${rpcName}] Got ${logs.length} log(s)`);
    return logs;
  } catch (e) {
    const msg = e.message?.slice(0, 120) || String(e);
    console.log(`  [${rpcName}] Failed: ${msg}`);
    return null;
  }
}

async function parseReceipt(receipt, label) {
  let found = null;
  for (const log of receipt.logs) {
    // Check for PositionSplit
    if (log.topics[0] === POSITION_SPLIT_TOPIC) {
      if (log.topics[3]?.toLowerCase() === conditionIdPadded.toLowerCase()) {
        try {
          const decoded = iface.parseLog(log);
          const col = decoded.args.collateralToken;
          console.log(`  [${label}] ✔ PositionSplit found! collateralToken=${col}`);
          found = col;
        } catch (e) {
          // try raw
          const col = "0x" + log.data.slice(26, 66);
          console.log(`  [${label}] PositionSplit raw collateralToken=${col}`);
          found = col;
        }
      }
    }
    // Check for ERC20 Transfer from wallet to CTF or from USDCE/pUSD
    if (log.topics[0] === TRANSFER_TOPIC) {
      const src = "0x" + (log.topics[1] || "").slice(26);
      const dst = "0x" + (log.topics[2] || "").slice(26);
      const addr = log.address.toLowerCase();
      if (addr === USDCE_ADDR.toLowerCase() || addr === PUSD_ADDR.toLowerCase()) {
        const name = addr === USDCE_ADDR.toLowerCase() ? "USDC.e" : "pUSD";
        console.log(`  [${label}] ERC20 Transfer: ${name} from=${src} to=${dst} amount=${log.data}`);
      }
    }
  }
  return found;
}

async function main() {
  const primaryProvider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC_URL);

  console.log("════════════════════════════════════════");
  console.log("OP8 COLLATERAL PROBE v2");
  console.log("════════════════════════════════════════");

  let confirmedCollateral = null;

  // ── Strategy A: Read trades table, fetch receipt ─────────────────────────
  console.log("\n─── Strategy A: Trades table tx_hash → receipt ───");
  const db = new Database(DB_PATH, { readonly: true });

  // Look for trades matching this market
  const trades = db.prepare(
    `SELECT * FROM trades WHERE market_id = ? OR market_id = ? ORDER BY timestamp DESC LIMIT 10`
  ).all(CONDITION_ID, CONDITION_ID.toLowerCase());

  const positions = db.prepare(`SELECT * FROM positions WHERE id = 8`).all();
  const allPositions = db.prepare(`SELECT * FROM positions WHERE market_id LIKE ?`).all(`%${CONDITION_ID.slice(2, 20)}%`);
  db.close();

  console.log(`  Trades found for market: ${trades.length}`);
  for (const t of trades) {
    console.log(`    trade id=${t.id} tx_hash=${t.tx_hash || "(null)"} timestamp=${t.timestamp}`);
  }

  // Try fetching receipts for any tx hashes we found
  const txHashes = trades.map(t => t.tx_hash).filter(Boolean);
  for (const txHash of txHashes) {
    console.log(`\n  Fetching receipt for ${txHash}...`);
    try {
      const receipt = await primaryProvider.getTransactionReceipt(txHash);
      if (!receipt) {
        console.log("  Receipt not available (pruned).");
      } else {
        console.log(`  Receipt found: block ${receipt.blockNumber}, status=${receipt.status}, logs=${receipt.logs.length}`);
        const col = await parseReceipt(receipt, "primary RPC");
        if (col) { confirmedCollateral = col; break; }
      }
    } catch (e) {
      console.log("  Error:", e.message?.slice(0, 100));
    }
  }

  // ── Strategy A2: CLOB API for our trade history ────────────────────────────
  if (!confirmedCollateral) {
    console.log("\n─── Strategy A2: CLOB trade history for our wallet ───");
    try {
      // Get trades for this market from CLOB
      const r = await fetch(`https://clob.polymarket.com/trades?market=${CONDITION_ID}&maker_address=${WALLET.toLowerCase()}`);
      if (r.ok) {
        const data = await r.json();
        const tradeList = data.data || data || [];
        console.log(`  CLOB trades returned: ${Array.isArray(tradeList) ? tradeList.length : "not array"}`);
        for (const t of (Array.isArray(tradeList) ? tradeList.slice(0, 5) : [])) {
          console.log(`    id=${t.id} side=${t.side} size=${t.size} price=${t.price} status=${t.status} tx=${t.transaction_hash || t.transactionHash || "(none)"}`);
        }
        // Also try taker
        const r2 = await fetch(`https://clob.polymarket.com/trades?market=${CONDITION_ID}&taker_address=${WALLET.toLowerCase()}`);
        if (r2.ok) {
          const data2 = await r2.json();
          const list2 = data2.data || data2 || [];
          console.log(`  CLOB taker trades: ${Array.isArray(list2) ? list2.length : "not array"}`);
          for (const t of (Array.isArray(list2) ? list2.slice(0, 5) : [])) {
            console.log(`    id=${t.id} side=${t.side} size=${t.size} price=${t.price} status=${t.status} tx=${t.transaction_hash || t.transactionHash || "(none)"}`);
            const txh = t.transaction_hash || t.transactionHash;
            if (txh && !confirmedCollateral) {
              console.log(`    Fetching receipt for CLOB taker tx ${txh}...`);
              try {
                const receipt = await primaryProvider.getTransactionReceipt(txh);
                if (receipt) {
                  const col = await parseReceipt(receipt, "CLOB taker tx");
                  if (col) confirmedCollateral = col;
                }
              } catch {}
            }
          }
        }
      } else {
        console.log("  CLOB API status:", r.status);
      }
    } catch (e) {
      console.log("  CLOB error:", e.message);
    }
  }

  // ── Strategy B: Polygonscan API ────────────────────────────────────────────
  if (!confirmedCollateral) {
    console.log("\n─── Strategy B: Polygonscan API getLogs ───");
    // Try with and without API key
    const pscanUrls = [
      `https://api.polygonscan.com/api?module=logs&action=getLogs&address=${CTF_ADDR}&topic0=${POSITION_SPLIT_TOPIC}&topic3=${conditionIdPadded}&fromBlock=0&toBlock=latest`,
      `https://api.polygonscan.com/api?module=logs&action=getLogs&address=${CTF_ADDR}&topic0=${POSITION_SPLIT_TOPIC}&topic0_3_opr=and&topic3=${conditionIdPadded}&fromBlock=70000000&toBlock=99999999`,
    ];
    for (const url of pscanUrls) {
      try {
        console.log("  Querying:", url.slice(0, 120) + "...");
        const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (r.ok) {
          const d = await r.json();
          console.log("  status:", d.status, "message:", d.message, "result count:", Array.isArray(d.result) ? d.result.length : "N/A");
          if (d.status === "1" && Array.isArray(d.result) && d.result.length > 0) {
            for (const log of d.result) {
              console.log(`  PositionSplit log: tx=${log.transactionHash} block=${parseInt(log.blockNumber, 16)}`);
              if (log.data && log.data.length >= 66) {
                const raw = "0x" + log.data.slice(26, 66);
                console.log(`  collateralToken (raw)= ${raw}`);
                if (raw.toLowerCase() === USDCE_ADDR.toLowerCase()) {
                  console.log("  ✔ USDC.e confirmed via Polygonscan!");
                  confirmedCollateral = "USDC.e";
                } else if (raw.toLowerCase() === PUSD_ADDR.toLowerCase()) {
                  console.log("  ⚠ pUSD via Polygonscan");
                  confirmedCollateral = "pUSD";
                } else {
                  confirmedCollateral = raw;
                }
              }
            }
            if (confirmedCollateral) break;
          }
        }
      } catch (e) {
        console.log("  Polygonscan error:", e.message?.slice(0, 80));
      }
    }
  }

  // ── Strategy C: Alternate archive RPCs ────────────────────────────────────
  if (!confirmedCollateral) {
    console.log("\n─── Strategy C: Alternate RPCs (archive nodes) ───");
    // Market created ~May 2025 = block ~72M. Scan around there.
    const scanRanges = [
      [72300000, 72500000],  // ~market creation window
      [72500000, 73000000],  // wider window
      [73000000, 76000000],  // further out
    ];

    for (const rpcUrl of ALTERNATE_RPCS) {
      if (confirmedCollateral) break;
      const altProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
      let latestAlt;
      try {
        latestAlt = await altProvider.getBlockNumber();
        console.log(`\n  [${rpcUrl}] latest block: ${latestAlt}`);
      } catch (e) {
        console.log(`  [${rpcUrl}] unreachable: ${e.message?.slice(0, 60)}`);
        continue;
      }

      for (const [from, to] of scanRanges) {
        if (confirmedCollateral) break;
        const logs = await tryGetLogs(altProvider, rpcUrl, from, Math.min(to, latestAlt));
        if (logs && logs.length > 0) {
          for (const log of logs) {
            try {
              const decoded = iface.parseLog(log);
              const col = decoded.args.collateralToken;
              console.log(`  ✔ PositionSplit found: collateralToken=${col} tx=${log.transactionHash}`);
              if (col.toLowerCase() === USDCE_ADDR.toLowerCase()) confirmedCollateral = "USDC.e";
              else if (col.toLowerCase() === PUSD_ADDR.toLowerCase()) confirmedCollateral = "pUSD";
              else confirmedCollateral = col;
            } catch {
              const col = "0x" + log.data.slice(26, 66);
              console.log(`  PositionSplit raw col=${col}`);
              if (col.toLowerCase() === USDCE_ADDR.toLowerCase()) confirmedCollateral = "USDC.e";
            }
          }
        }
      }

      // Also check recent range on this RPC
      if (!confirmedCollateral && latestAlt) {
        const recentFrom = latestAlt - 500000;
        const logs = await tryGetLogs(altProvider, rpcUrl + " (recent)", recentFrom, latestAlt);
        if (logs && logs.length > 0) {
          for (const log of logs) {
            try {
              const decoded = iface.parseLog(log);
              const col = decoded.args.collateralToken;
              console.log(`  ✔ PositionSplit found (recent): collateralToken=${col}`);
              if (col.toLowerCase() === USDCE_ADDR.toLowerCase()) confirmedCollateral = "USDC.e";
              else if (col.toLowerCase() === PUSD_ADDR.toLowerCase()) confirmedCollateral = "pUSD";
              else confirmedCollateral = col;
            } catch {}
          }
        }
      }
    }
  }

  // ── Strategy D: Check market via Gamma for any collateral hints ────────────
  if (!confirmedCollateral) {
    console.log("\n─── Strategy D: Gamma API for collateral clues ───");
    try {
      const r = await fetch(`https://gamma-api.polymarket.com/markets?condition_id=${CONDITION_ID}`);
      if (r.ok) {
        const data = await r.json();
        const market = Array.isArray(data) ? data[0] : data;
        if (market) {
          console.log("  Gamma fields:", JSON.stringify(Object.keys(market)));
          // Look for collateral_token, collateral, currency, etc.
          const fields = ["collateral_token", "collateral", "currency", "token", "collateralToken",
                          "fpmm", "market_maker_address", "accepting_orders", "accepting_order_timestamp"];
          for (const f of fields) {
            if (market[f] !== undefined) console.log(`  ${f}: ${JSON.stringify(market[f])}`);
          }
        }
      }
    } catch (e) {
      console.log("  Gamma error:", e.message);
    }
  }

  // ── Strategy E: Check our wallet's tx history on Polygonscan ──────────────
  if (!confirmedCollateral) {
    console.log("\n─── Strategy E: Wallet tx history on Polygonscan ───");
    try {
      // Find internal txs from our wallet to CTF contract around position open date (Apr 28, 2026)
      // Convert date to approximate block
      const openDate = new Date("2026-04-28T21:23:32.090Z");
      const openTs = openDate.getTime() / 1000;
      const polygonGenesis = 1587000000;
      const estBlock = Math.floor((openTs - polygonGenesis) / 2.2);
      const fromBlock = Math.max(0, estBlock - 1000);
      const toBlock = estBlock + 1000;
      console.log(`  Position opened ~block ${estBlock}, scanning ${fromBlock}–${toBlock}`);

      const url = `https://api.polygonscan.com/api?module=account&action=txlist&address=${WALLET}&startblock=${fromBlock}&endblock=${toBlock}&sort=asc`;
      console.log("  Querying:", url.slice(0, 100) + "...");
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const d = await r.json();
        console.log("  status:", d.status, "result count:", Array.isArray(d.result) ? d.result.length : "N/A");
        if (d.status === "1" && Array.isArray(d.result)) {
          for (const tx of d.result) {
            console.log(`  tx: ${tx.hash} to=${tx.to} methodId=${tx.input?.slice(0,10)} ts=${new Date(tx.timeStamp * 1000).toISOString()}`);
            // Fetch receipt for CTF-related txs
            if (tx.to?.toLowerCase() === CTF_ADDR.toLowerCase() ||
                tx.to?.toLowerCase() === "0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e") { // V1 exchange
              console.log(`  → CTF/Exchange tx found. Fetching receipt...`);
              try {
                const receipt = await primaryProvider.getTransactionReceipt(tx.hash);
                if (receipt) {
                  console.log(`    Receipt: block=${receipt.blockNumber} logs=${receipt.logs.length}`);
                  const col = await parseReceipt(receipt, "wallet tx");
                  if (col) { confirmedCollateral = col; break; }
                }
              } catch {}
            }
          }
        }
      }
    } catch (e) {
      console.log("  Strategy E error:", e.message?.slice(0, 80));
    }
  }

  // ── Strategy F: Check Polygonscan for CLOB V1/V2 exchange tx on this market ─
  if (!confirmedCollateral) {
    console.log("\n─── Strategy F: Polygonscan token transfers involving our token_id ───");
    const tokenId = "96879728524724829206778105208231612105108933371818952028537619813955011537087";
    // ERC1155 TransferSingle topic: TransferSingle(address,address,address,uint256,uint256)
    // id is the 4th param (not indexed in standard ERC1155, but CTF might index it)
    try {
      const url = `https://api.polygonscan.com/api?module=logs&action=getLogs&address=${CTF_ADDR}&topic0=${TRANSFER_SINGLE_TOPIC}&fromBlock=72000000&toBlock=99999999`;
      // This is too broad — we need to filter by token id. Let's skip if no key.
      console.log("  Skipping broad TransferSingle scan (would need token_id filter, too noisy without API key).");
    } catch {}

    // Instead, check Polygonscan tokennfttx
    try {
      const url = `https://api.polygonscan.com/api?module=account&action=token1155tx&contractaddress=${CTF_ADDR}&address=${WALLET}&fromBlock=0&toBlock=latest&sort=desc&offset=20`;
      console.log("  Polygonscan ERC1155 tx for our wallet...");
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const d = await r.json();
        console.log("  status:", d.status, "message:", d.message);
        if (d.status === "1" && Array.isArray(d.result)) {
          for (const t of d.result.slice(0, 5)) {
            console.log(`  ERC1155 tx: hash=${t.hash} tokenId=${t.tokenID} value=${t.tokenValue} ts=${new Date(t.timeStamp * 1000).toISOString()}`);
            if (t.tokenID === tokenId || t.hash) {
              // Fetch receipt to check collateral
              try {
                const receipt = await primaryProvider.getTransactionReceipt(t.hash);
                if (receipt) {
                  console.log(`  Receipt: block=${receipt.blockNumber} logs=${receipt.logs.length}`);
                  const col = await parseReceipt(receipt, "ERC1155 tx");
                  if (col) { confirmedCollateral = col; break; }
                }
              } catch {}
            }
          }
        }
      }
    } catch (e) {
      console.log("  ERC1155 query error:", e.message?.slice(0, 80));
    }
  }

  // ── Final Verdict ─────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("COLLATERAL PROBE v2 VERDICT");
  console.log("════════════════════════════════════════");

  if (!confirmedCollateral) {
    console.error("  *** HALT: Could not confirm collateral type via any method. ***");
    console.error("  All strategies exhausted without finding a PositionSplit event.");
    console.error("  Manual options:");
    console.error("  1. Find the original fill tx hash on Polygonscan web UI");
    console.error("     Search: https://polygonscan.com/address/0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935");
    console.error("     Look for tx around 2026-04-28 21:23 UTC to CTF or CLOB exchange");
    console.error("  2. Use a full archive node RPC (Alchemy, Infura, QuickNode)");
    process.exit(1);
  }

  const isUSDCe = confirmedCollateral === "USDC.e" || confirmedCollateral?.toLowerCase() === USDCE_ADDR.toLowerCase();
  const isPUSD  = confirmedCollateral === "pUSD"   || confirmedCollateral?.toLowerCase() === PUSD_ADDR.toLowerCase();

  if (isUSDCe) {
    console.log("  ✔ CONFIRMED: Collateral = USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)");
    console.log("  Proceed to op8_redeem.js");
    process.exit(0);
  } else if (isPUSD) {
    console.error("  *** HALT: Collateral = pUSD. Redemption must use pUSD. ***");
    process.exit(1);
  } else {
    console.error("  *** HALT: Collateral = unexpected token:", confirmedCollateral, "***");
    process.exit(1);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
