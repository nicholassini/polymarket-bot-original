#!/usr/bin/env node
/**
 * test_archive_rpc.js — Verify that POLYGON_ARCHIVE_RPC_URL supports historical log access.
 *
 * This script is for pre-reconciler infrastructure validation only.
 * The archive RPC is NEVER used by the live trading hot path.
 *
 * Usage:  node test_archive_rpc.js
 * Exit 0: archive node confirmed working
 * Exit 1: failure (check output for details)
 */

require("dotenv").config();
const { ethers } = require("ethers");

const ARCHIVE_URL = process.env.POLYGON_ARCHIVE_RPC_URL;
const FALLBACK_URL = process.env.POLYGON_RPC_URL;

// A Polygon block from ~6 months before the current date (approx. Nov 2025).
// Block ~65,000,000 was mined around late 2024/early 2025 on Polygon.
// Pruned nodes reject eth_getLogs on blocks this old with -32701.
const HISTORICAL_BLOCK = 65_000_000;

// ConditionalTokens (CTF) contract — emits PositionSplit on every new position.
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

async function main() {
  let rpcUrl = ARCHIVE_URL;
  let usingFallback = false;

  if (!rpcUrl) {
    if (FALLBACK_URL) {
      console.warn(
        "[WARN] POLYGON_ARCHIVE_RPC_URL is not set. Falling back to POLYGON_RPC_URL."
      );
      console.warn(
        "[WARN] The fallback RPC is pruned and will likely fail historical log queries."
      );
      rpcUrl = FALLBACK_URL;
      usingFallback = true;
    } else {
      console.error(
        "[FAIL] Neither POLYGON_ARCHIVE_RPC_URL nor POLYGON_RPC_URL is set in .env"
      );
      process.exit(1);
    }
  }

  console.log(`[INFO] RPC URL   : ${rpcUrl}`);
  console.log(`[INFO] Fallback  : ${usingFallback}`);

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  // ── Step 1: Basic connectivity — fetch a recent block ─────────────────────
  console.log("\n[STEP 1] Basic connectivity — fetching latest block number...");
  let latestBlock;
  try {
    latestBlock = await provider.getBlockNumber();
    console.log(`[OK]    Latest block: ${latestBlock}`);
  } catch (err) {
    console.error(`[FAIL]  Could not fetch latest block: ${err.message}`);
    process.exit(1);
  }

  // ── Step 2: Historical eth_getLogs ────────────────────────────────────────
  console.log(
    `\n[STEP 2] Historical eth_getLogs — querying CTF PositionSplit events`
  );
  console.log(
    `         Block range: ${HISTORICAL_BLOCK} – ${HISTORICAL_BLOCK + 100}`
  );

  // PositionSplit(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)
  const POSITION_SPLIT_TOPIC =
    "0x9b1d6efa96f28f9fabc8b54c27c8a7e98dfe0543e7cc14bd2dc99c5ccdc9bf1b";

  // Try wide range first; fall back to 10-block range for free-tier nodes that
  // have archive data but cap block range (e.g., Alchemy free tier).
  for (const range of [100, 9]) {
    console.log(
      `         Block range: ${HISTORICAL_BLOCK} – ${HISTORICAL_BLOCK + range} (range=${range + 1})`
    );
    try {
      const logs = await provider.getLogs({
        address: CTF_ADDRESS,
        topics: [POSITION_SPLIT_TOPIC],
        fromBlock: HISTORICAL_BLOCK,
        toBlock: HISTORICAL_BLOCK + range,
      });
      console.log(
        `[OK]    eth_getLogs succeeded. Found ${logs.length} PositionSplit event(s) in range.`
      );
      console.log(
        "[OK]    Archive node confirmed: historical log access is working."
      );
      if (range === 9) {
        console.warn(
          "[NOTE]  This node caps block range per query. The reconciler will need to paginate in small windows."
        );
      }
      if (usingFallback) {
        console.warn(
          "\n[WARN] This succeeded on the fallback pruned RPC — unusual. Verify POLYGON_ARCHIVE_RPC_URL is set."
        );
      }
      process.exit(0);
    } catch (err) {
      const code = err.code || (err.error && err.error.code);
      const msg = err.message || "";
      if (msg.includes("block range") || msg.includes("range")) {
        // Free-tier range limit — retry with smaller window
        console.warn(`[WARN]  Block range too wide (${range + 1} blocks), retrying smaller...`);
        continue;
      }
      if (code === -32701 || msg.includes("pruned")) {
        console.error(
          `[FAIL]  RPC rejected historical query (-32701 / pruned): ${msg}`
        );
        console.error(
          "[FAIL]  This node does not support archive access. Set POLYGON_ARCHIVE_RPC_URL to an archive endpoint."
        );
      } else if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("timeout")) {
        console.error(
          `[FAIL]  Network error — check that POLYGON_ARCHIVE_RPC_URL is a valid URL: ${msg}`
        );
      } else {
        console.error(`[FAIL]  Unexpected error during eth_getLogs: ${msg}`);
      }
      process.exit(1);
    }
  }
}

main();
