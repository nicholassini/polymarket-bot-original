require("dotenv").config();
const { ethers } = require("ethers");

async function check() {
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const WALLET = "0x713Df3DDcA8E236A1d5cdf985b0c643C992c8935";
  const conditionId = "0x1a50773e4eeb903115d8017c5989b9760641aa63a41074d0060b4416c65fb54f";
  
  const CTF = new ethers.Contract("0x4D97DCd97eC945f40cF65F87097ACe5EA0476045", [
    "function payoutNumerators(bytes32,uint256) view returns (uint256)",
    "function payoutDenominator(bytes32) view returns (uint256)",
    "function redeemPositions(address,bytes32,bytes32,uint256[])",
    "function balanceOf(address,uint256) view returns (uint256)"
  ], provider);

  // Check payout numerators for both outcomes
  const denom = await CTF.payoutDenominator(conditionId);
  const num0 = await CTF.payoutNumerators(conditionId, 0);
  const num1 = await CTF.payoutNumerators(conditionId, 1);
  console.log("Payout denominator:", denom.toString());
  console.log("Payout numerator[0] (Team Vitality):", num0.toString());
  console.log("Payout numerator[1] (Solary):", num1.toString());
  
  // Solary is outcome index 1, so its index set = 2 (bitmask 10)
  // We need to redeem with index set [2] for Solary
  console.log("\nSolary winning means numerator[1] should be 1");
  console.log("Index set for Solary = 2 (binary 10)");

  // Try with USDC.e as collateral instead of pUSD
  const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  const pUSD_ADDR = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
  
  // Check USDC.e balance before
  const usdce = new ethers.Contract(USDC_E, ["function balanceOf(address) view returns (uint256)"], provider);
  const pusd = new ethers.Contract(pUSD_ADDR, ["function balanceOf(address) view returns (uint256)"], provider);
  
  const usdceBefore = await usdce.balanceOf(WALLET);
  const pusdBefore = await pusd.balanceOf(WALLET);
  console.log("\nUSDC.e balance:", ethers.utils.formatUnits(usdceBefore, 6));
  console.log("pUSD balance:", ethers.utils.formatUnits(pusdBefore, 6));
  
  // Try redeeming with USDC.e collateral
  const wallet = new ethers.Wallet(process.env.POLYMARKET_PRIVATE_KEY, provider);
  const ctfSigner = CTF.connect(wallet);
  
  console.log("\nAttempting redemption with USDC.e as collateral, indexSets=[2]...");
  const tx = await ctfSigner.redeemPositions(
    USDC_E,
    ethers.constants.HashZero,
    conditionId,
    [2],
    {
      maxPriorityFeePerGas: ethers.utils.parseUnits("35", "gwei"),
      maxFeePerGas: ethers.utils.parseUnits("150", "gwei"),
      gasLimit: 300000
    }
  );
  console.log("Tx:", tx.hash);
  await tx.wait();
  
  const usdceAfter = await usdce.balanceOf(WALLET);
  const pusdAfter = await pusd.balanceOf(WALLET);
  console.log("USDC.e after:", ethers.utils.formatUnits(usdceAfter, 6));
  console.log("pUSD after:", ethers.utils.formatUnits(pusdAfter, 6));
  console.log("USDC.e gained:", ethers.utils.formatUnits(usdceAfter.sub(usdceBefore), 6));
  console.log("pUSD gained:", ethers.utils.formatUnits(pusdAfter.sub(pusdBefore), 6));
  
  // Check if tokens were consumed
  const tokenBal = await CTF.balanceOf(WALLET, "81273843018050116075956161527153440195727076923967631382662298499552121963863");
  console.log("Remaining Solary tokens:", tokenBal.toString());
}

check().catch(console.error);
