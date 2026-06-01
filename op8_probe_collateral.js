/**
 * op8_probe_collateral.js — Step 2.2: Confirm USDC.e is the correct collateral
 * for redemption of position #8 via on-chain PositionSplit event lookup.
 *
 * The CTF ConditionalTokens contract emits:
 *   PositionSplit(address indexed stakeholder, address collateralToken,
 *                 bytes32 indexed parentCollectionId, bytes32 indexed conditionId,
 *                 uint256[] partition, uint256 amount)
 *
 * collateralToken is NOT indexed (lives in event data), so we need to scan logs.
 * We use topic3 = conditionId to filter. If we find the event, the collateralToken
 * from the data IS the authoritative collateral for this condition.
 *
 * READ-ONLY. No transactions.
 */
require("dotenv").config();
const { ethers } = require("ethers");

const CTF_ADDR     = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const CONDITION_ID = "0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e";
const PUSD_ADDR    = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDCE_ADDR   = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

// PositionSplit(address,address,bytes32,bytes32,uint256[],uint256)
const POSITION_SPLIT_SIG = "PositionSplit(address,address,bytes32,bytes32,uint256[],uint256)";
const POSITION_SPLIT_TOPIC = ethers.utils.id(POSITION_SPLIT_SIG);

// PayoutRedemption(address,address,bytes32,bytes32,uint256[],uint256) - to check if already redeemed
const PAYOUT_REDEMPTION_SIG = "PayoutRedemption(address,address,bytes32,bytes32,uint256[],uint256)";
const PAYOUT_REDEMPTION_TOPIC = ethers.utils.id(PAYOUT_REDEMPTION_SIG);

async function scanLogs(provider, fromBlock, toBlock, topic0, topic3) {
  const BATCH = 100000;
  const results = [];
  for (let start = fromBlock; start <= toBlock; start += BATCH) {
    const end = Math.min(start + BATCH - 1, toBlock);
    try {
      const logs = await provider.getLogs({
        address: CTF_ADDR,
        topics: [topic0, null, null, topic3],
        fromBlock: start,
        toBlock: end,
      });
      results.push(...logs);
      if (logs.length > 0) {
        console.log(`  Found ${logs.length} log(s) in blocks ${start}–${end}`);
        break; // Stop on first hit
      }
    } catch (e) {
      // If range too large, RPC may reject — shrink and retry
      if (e.message?.includes("block range") || e.message?.includes("too many")) {
        console.log(`  RPC rejected range ${start}–${end}, retrying with smaller batch...`);
        const SMALL = 10000;
        for (let s2 = start; s2 <= end; s2 += SMALL) {
          const e2 = Math.min(s2 + SMALL - 1, end);
          try {
            const logs2 = await provider.getLogs({
              address: CTF_ADDR,
              topics: [topic0, null, null, topic3],
              fromBlock: s2,
              toBlock: e2,
            });
            results.push(...logs2);
            if (logs2.length > 0) {
              console.log(`  Found ${logs2.length} log(s) in sub-range ${s2}–${e2}`);
              return results;
            }
          } catch (e3) {
            console.log(`  Sub-range ${s2}–${e2} also failed: ${e3.message}`);
          }
        }
      } else {
        console.log(`  getLogs error for ${start}–${end}: ${e.message}`);
      }
    }
  }
  return results;
}

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC_URL);

  console.log("════════════════════════════════════════");
  console.log("OP8 COLLATERAL PROBE");
  console.log("════════════════════════════════════════");
  console.log("  PositionSplit topic0:", POSITION_SPLIT_TOPIC);
  console.log("  conditionId (topic3):", CONDITION_ID);

  // ── Method 1: Gamma API for market creation date (to narrow block range) ──
  console.log("\n─── Method 1: Gamma API market info ───");
  let fromBlock = 30000000; // Polymarket on Polygon since ~2021, block ~15M, use 30M as conservative
  try {
    const r = await fetch(`https://gamma-api.polymarket.com/markets?condition_id=${CONDITION_ID}`);
    if (r.ok) {
      const data = await r.json();
      const market = Array.isArray(data) ? data[0] : data;
      if (market) {
        console.log("  Gamma market found:");
        console.log("    question       :", market.question);
        console.log("    startDate      :", market.startDate || market.start_date);
        console.log("    endDate        :", market.endDate || market.end_date);
        console.log("    createdAt      :", market.createdAt || market.created_at);
        console.log("    closed         :", market.closed);
        console.log("    neg_risk       :", market.neg_risk);

        // Estimate fromBlock from creation date
        const created = market.createdAt || market.created_at || market.startDate || market.start_date;
        if (created) {
          const createdTs = new Date(created).getTime() / 1000;
          // Polygon genesis ~April 2020 = Unix 1587000000, block 0
          // ~2 sec/block average
          const polygonGenesis = 1587000000;
          const estBlock = Math.floor((createdTs - polygonGenesis) / 2.2);
          fromBlock = Math.max(15000000, estBlock - 200000); // go 200k blocks (~5 days) before
          console.log(`    Estimated creation block ~${estBlock}, scanning from ${fromBlock}`);
        }
      } else {
        console.log("  Gamma returned empty array for this conditionId.");
      }
    } else {
      console.log("  Gamma API status:", r.status);
    }
  } catch (e) {
    console.log("  Gamma API error:", e.message);
  }

  // ── Method 2: Scan PositionSplit logs on CTF ──────────────────────────────
  console.log("\n─── Method 2: ETH log scan for PositionSplit ───");
  const latestBlock = await provider.getBlockNumber();
  console.log(`  Scanning blocks ${fromBlock} → ${latestBlock} for PositionSplit with conditionId=${CONDITION_ID}`);

  const conditionIdPadded = ethers.utils.hexZeroPad(CONDITION_ID, 32);
  const splitLogs = await scanLogs(provider, fromBlock, latestBlock, POSITION_SPLIT_TOPIC, conditionIdPadded);

  let confirmedCollateral = null;

  if (splitLogs.length > 0) {
    console.log(`\n  ✔ Found ${splitLogs.length} PositionSplit event(s) for this conditionId`);

    for (const log of splitLogs) {
      console.log(`\n  Log in tx ${log.transactionHash} block ${log.blockNumber}`);

      // Decode: data = (address collateralToken, uint256[] partition, uint256 amount)
      // Actually: PositionSplit(address indexed stakeholder, address collateralToken,
      //            bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)
      // topics[0] = sig, topics[1] = stakeholder, topics[2] = parentCollectionId, topics[3] = conditionId
      // data = abi.encode(collateralToken, partition, amount)
      //   collateralToken is address (padded to 32 bytes), then dynamic array, then uint256

      try {
        const iface = new ethers.utils.Interface([
          `event PositionSplit(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)`
        ]);
        const decoded = iface.parseLog(log);
        const collateral = decoded.args.collateralToken;
        console.log("    stakeholder          :", decoded.args.stakeholder);
        console.log("    collateralToken      :", collateral);
        console.log("    parentCollectionId   :", decoded.args.parentCollectionId);
        console.log("    conditionId          :", decoded.args.conditionId);
        console.log("    partition            :", decoded.args.partition.map(p => p.toString()).join(", "));
        console.log("    amount               :", decoded.args.amount.toString());

        if (collateral.toLowerCase() === USDCE_ADDR.toLowerCase()) {
          console.log("    ✔✔✔ collateralToken = USDC.e — CONFIRMED");
          confirmedCollateral = "USDC.e";
        } else if (collateral.toLowerCase() === PUSD_ADDR.toLowerCase()) {
          console.log("    ⚠ collateralToken = pUSD");
          confirmedCollateral = "pUSD";
        } else {
          console.log("    ⚠ collateralToken is NEITHER pUSD nor USDC.e:", collateral);
          confirmedCollateral = collateral;
        }
      } catch (e) {
        console.log("    Decode error:", e.message);
        // Try raw decode
        try {
          const addrRaw = "0x" + log.data.slice(26, 66);
          console.log("    Raw collateralToken (first 32 bytes of data):", addrRaw);
          if (addrRaw.toLowerCase() === USDCE_ADDR.toLowerCase()) {
            console.log("    ✔ Raw match: USDC.e");
            confirmedCollateral = "USDC.e";
          } else if (addrRaw.toLowerCase() === PUSD_ADDR.toLowerCase()) {
            console.log("    ⚠ Raw match: pUSD");
            confirmedCollateral = "pUSD";
          }
        } catch {}
      }
    }
  } else {
    console.log("  No PositionSplit events found in block range. Trying alternative methods...");
  }

  // ── Method 3: Check PositionSplit via Polygonscan (no key required for basic calls) ──
  if (!confirmedCollateral) {
    console.log("\n─── Method 3: Polygonscan API (no key) ───");
    try {
      // topic3 = conditionId as bytes32 (already 32 bytes)
      const url = `https://api.polygonscan.com/api?module=logs&action=getLogs` +
        `&address=${CTF_ADDR}` +
        `&topic0=${POSITION_SPLIT_TOPIC}` +
        `&topic0_3_opr=and&topic3=${conditionIdPadded}` +
        `&fromBlock=0&toBlock=latest&apikey=YourApiKeyToken`;
      console.log("  Querying:", url.replace("YourApiKeyToken", "***"));
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        console.log("  Polygonscan status:", d.status, d.message);
        if (d.result && Array.isArray(d.result) && d.result.length > 0) {
          for (const log of d.result) {
            console.log("  Log:", log.transactionHash, "block:", log.blockNumber);
            // data[0] is collateralToken (padded)
            if (log.data && log.data.length >= 66) {
              const addrRaw = "0x" + log.data.slice(26, 66);
              console.log("  collateralToken (raw):", addrRaw);
              if (addrRaw.toLowerCase() === USDCE_ADDR.toLowerCase()) {
                console.log("  ✔ USDC.e confirmed via Polygonscan");
                confirmedCollateral = "USDC.e";
              } else if (addrRaw.toLowerCase() === PUSD_ADDR.toLowerCase()) {
                console.log("  ⚠ pUSD via Polygonscan");
                confirmedCollateral = "pUSD";
              }
            }
          }
        }
      }
    } catch (e) {
      console.log("  Polygonscan error:", e.message);
    }
  }

  // ── Method 4: Check V1 CLOB Exchange approval as circumstantial evidence ──
  if (!confirmedCollateral) {
    console.log("\n─── Method 4: Check allowance on V1 Exchange (circumstantial) ───");
    // V1 CLOB Exchange: 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
    // V2 CLOB Exchange: 0xC5d563A36AE78145C45a50134d48A1a9FE9d1C34 (approx)
    const V1_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
    const erc20Abi = [
      "function allowance(address owner, address spender) view returns (uint256)"
    ];
    const wallet = "0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935";
    const usdce = new ethers.Contract(USDCE_ADDR, erc20Abi, provider);
    const pusd  = new ethers.Contract(PUSD_ADDR,  erc20Abi, provider);

    const usdceAllowanceV1 = await usdce.allowance(wallet, V1_EXCHANGE);
    const pusdAllowanceV1  = await pusd.allowance(wallet, V1_EXCHANGE);

    console.log(`  USDC.e allowance to V1 exchange (${V1_EXCHANGE}): ${usdceAllowanceV1.toString()}`);
    console.log(`  pUSD  allowance to V1 exchange (${V1_EXCHANGE}): ${pusdAllowanceV1.toString()}`);
    console.log("  NOTE: Allowances are circumstantial — not definitive collateral proof.");
  }

  // ── Method 5: Also scan for PayoutRedemption to see if already redeemed ──
  console.log("\n─── Method 5: Check for prior PayoutRedemption (already redeemed?) ───");
  const redemptionLogs = await scanLogs(provider, fromBlock, latestBlock, PAYOUT_REDEMPTION_TOPIC, conditionIdPadded);
  if (redemptionLogs.length > 0) {
    console.log(`  ⚠ Found ${redemptionLogs.length} prior PayoutRedemption event(s) for this conditionId!`);
    for (const log of redemptionLogs) {
      console.log(`    tx: ${log.transactionHash}, block: ${log.blockNumber}`);
    }
    console.log("  This may mean the position is already redeemed. Check CTF balance.");
  } else {
    console.log("  No prior PayoutRedemption found — position has not been redeemed.");
  }

  // ── Final verdict ─────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("COLLATERAL PROBE VERDICT");
  console.log("════════════════════════════════════════");

  if (!confirmedCollateral) {
    console.error("  *** HALT: Could not find a PositionSplit event to confirm collateral type. ***");
    console.error("  Do NOT proceed to redemption based on speculation.");
    console.error("  Manual investigation required: find the original splitPosition tx for conditionId");
    console.error("  " + CONDITION_ID);
    process.exit(1);
  }

  if (confirmedCollateral === "USDC.e") {
    console.log("  ✔ CONFIRMED: Collateral is USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)");
    console.log("  Proceed to op8_redeem.js");
    process.exit(0);
  } else if (confirmedCollateral === "pUSD") {
    console.error("  *** HALT: Collateral is pUSD, not USDC.e. The redemption call must use pUSD. ***");
    console.error("  Revise the redemption script before proceeding.");
    process.exit(1);
  } else {
    console.error("  *** HALT: Collateral is an unexpected token:", confirmedCollateral, "***");
    console.error("  Investigate before proceeding.");
    process.exit(1);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
