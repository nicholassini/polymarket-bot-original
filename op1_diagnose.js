require("dotenv").config();
const { ethers } = require("ethers");

async function diagnose() {
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const WALLET   = "0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935";

  const conditionId = "0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e";
  const tokenId     = "96879728524724829206778105208231612105108933371818952028537619813955011537087";
  const pUSD_ADDR   = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
  const USDC_E      = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

  const CTF = new ethers.Contract("0x4D97DCd97eC945f40cF65F87097ACe5EA0476045", [
    "function balanceOf(address,uint256) view returns (uint256)",
    "function payoutDenominator(bytes32) view returns (uint256)",
    "function payoutNumerators(bytes32,uint256) view returns (uint256)"
  ], provider);

  // Compute expected token_ids for both collaterals
  // CTF formula: positionId = uint256(keccak256(collateralToken, collectionId))
  // collectionId = keccak256(parentCollectionId [32 bytes], conditionId [32 bytes], indexSet [uint256])
  // For outcome 1, indexSet = 2

  function computeCollectionId(parentCollId, condId, indexSet) {
    return ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32", "uint256"],
        [parentCollId, condId, indexSet]
      )
    );
  }

  function computePositionId(collateral, collectionId) {
    const packed = ethers.utils.solidityPack(["address", "bytes32"], [collateral, collectionId]);
    return ethers.BigNumber.from(ethers.utils.keccak256(packed)).toString();
  }

  const PARENT = ethers.constants.HashZero;
  const cid1 = computeCollectionId(PARENT, conditionId, 1); // outcome 0
  const cid2 = computeCollectionId(PARENT, conditionId, 2); // outcome 1

  console.log("=== Token ID derivation check ===");
  console.log("Our DB token_id:", tokenId);
  console.log();

  for (const [label, collateral] of [["pUSD", pUSD_ADDR], ["USDC.e", USDC_E]]) {
    const pid0 = computePositionId(collateral, cid1);
    const pid1 = computePositionId(collateral, cid2);
    const match0 = pid0 === tokenId;
    const match1 = pid1 === tokenId;
    console.log(`[${label}] outcome0 positionId: ${pid0} ${match0 ? "<< MATCH" : ""}`);
    console.log(`[${label}] outcome1 positionId: ${pid1} ${match1 ? "<< MATCH" : ""}`);
  }

  // Also check actual CTF balances for both collateral-derived positions
  console.log("\n=== On-chain balances ===");
  const bal = await CTF.balanceOf(WALLET, tokenId);
  console.log("Our token balance:", bal.toString());

  // Check USDC.e balance
  const usdce = new ethers.Contract(USDC_E, ["function balanceOf(address) view returns (uint256)"], provider);
  const pusd  = new ethers.Contract(pUSD_ADDR, ["function balanceOf(address) view returns (uint256)"], provider);
  const usdceBal = await usdce.balanceOf(WALLET);
  const pusdBal  = await pusd.balanceOf(WALLET);
  console.log("USDC.e balance:", ethers.utils.formatUnits(usdceBal, 6));
  console.log("pUSD balance:  ", ethers.utils.formatUnits(pusdBal, 6));

  // CLOB extended info
  console.log("\n=== CLOB market detail ===");
  try {
    const r = await fetch("https://clob.polymarket.com/markets/" + conditionId);
    const d = await r.json();
    console.log("  question:", d.question);
    console.log("  collateral_token:", d.collateral_token || "(not in response)");
    console.log("  market_slug:", d.market_slug);
    console.log("  tokens:", JSON.stringify(d.tokens?.map(t => ({outcome: t.outcome, id: t.token_id}))));
  } catch (e) { console.log("  CLOB error:", e.message); }
}

diagnose().catch(e => { console.error("FATAL:", e); process.exit(1); });
