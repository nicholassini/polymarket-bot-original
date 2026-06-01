require("dotenv").config();
const { ethers } = require("ethers");

async function redeem() {
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const wallet = new ethers.Wallet(process.env.POLYMARKET_PRIVATE_KEY, provider);
  
  const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
  const pUSD = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
  const conditionId = "0x1a50773e4eeb903115d8017c5989b9760641aa63a41074d0060b4416c65fb54f";

  const ctf = new ethers.Contract(CTF, [
    "function redeemPositions(address,bytes32,bytes32,uint256[])",
    "function balanceOf(address,uint256) view returns (uint256)",
    "function getOutcomeSlotCount(bytes32) view returns (uint256)"
  ], wallet);

  const pUSDContract = new ethers.Contract(pUSD, [
    "function balanceOf(address) view returns (uint256)"
  ], provider);

  // Check how many outcome slots
  const slotCount = await ctf.getOutcomeSlotCount(conditionId);
  console.log("Outcome slots:", slotCount.toString());

  // Check pUSD before
  const before = await pUSDContract.balanceOf(wallet.address);
  console.log("pUSD before:", ethers.utils.formatUnits(before, 6));

  // Try redemption with index sets [1, 2] for binary
  console.log("\nSending redemption tx...");
  const tx = await ctf.redeemPositions(
    pUSD,
    ethers.constants.HashZero,
    conditionId,
    [1, 2],
    {
      maxPriorityFeePerGas: ethers.utils.parseUnits("35", "gwei"),
      maxFeePerGas: ethers.utils.parseUnits("150", "gwei"),
      gasLimit: 300000
    }
  );
  console.log("Tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmed in block", receipt.blockNumber);

  // Check pUSD after
  const after = await pUSDContract.balanceOf(wallet.address);
  console.log("pUSD after:", ethers.utils.formatUnits(after, 6));
  console.log("Gained:", ethers.utils.formatUnits(after.sub(before), 6), "pUSD");
}

redeem().catch(console.error);
