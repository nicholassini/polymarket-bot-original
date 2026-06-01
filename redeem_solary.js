require("dotenv").config();
const { ethers } = require("ethers");

async function redeem() {
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const wallet = new ethers.Wallet(process.env.POLYMARKET_PRIVATE_KEY, provider);
  console.log("Wallet:", wallet.address);

  const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
  const CTF_ABI = [
    "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external",
    "function balanceOf(address owner, uint256 id) view returns (uint256)",
    "function payoutDenominator(bytes32 conditionId) view returns (uint256)"
  ];
  const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);
  const ctfSigner = ctf.connect(wallet);

  const conditionId = "0x1a50773e4eeb903115d8017c5989b9760641aa63a41074d0060b4416c65fb54f";
  const pUSD = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

  // Verify still redeemable
  const denom = await ctf.payoutDenominator(conditionId);
  console.log("Payout denominator:", denom.toString());
  if (denom.eq(0)) { console.log("Not redeemable yet!"); return; }

  // Check token balance (Solary winning token)
  const tokenId = "81273843018050116075956161527153440195729790476933612164478660725404564498604";
  const bal = await ctf.balanceOf(wallet.address, tokenId);
  console.log("CTF token balance:", ethers.utils.formatUnits(bal, 6), "shares");
  if (bal.eq(0)) { console.log("No tokens to redeem!"); return; }

  // Check pUSD balance before
  const pUSDContract = new ethers.Contract(pUSD, ["function balanceOf(address) view returns (uint256)"], provider);
  const before = await pUSDContract.balanceOf(wallet.address);
  console.log("pUSD before:", ethers.utils.formatUnits(before, 6));

  // Redeem: indexSets [1, 2] covers both outcomes for a binary market
  // For the winning outcome, we need the correct index set
  // Solary was one outcome in a binary market - indexSets = [1] or [2]
  // Index set is a bitmask: outcome 0 = 1 (binary 01), outcome 1 = 2 (binary 10)
  console.log("\nSending redemption tx...");
  const tx = await ctfSigner.redeemPositions(
    pUSD,
    ethers.constants.HashZero, // parentCollectionId (root)
    conditionId,
    [1, 2], // Both index sets - contract handles whichever you hold
    {
      maxPriorityFeePerGas: ethers.utils.parseUnits("35", "gwei"),
      maxFeePerGas: ethers.utils.parseUnits("150", "gwei"),
      gasLimit: 300000
    }
  );
  console.log("Tx hash:", tx.hash);
  console.log("Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("Confirmed in block", receipt.blockNumber, "| gas used:", receipt.gasUsed.toString());

  // Check pUSD balance after
  const after = await pUSDContract.balanceOf(wallet.address);
  console.log("\npUSD after:", ethers.utils.formatUnits(after, 6));
  console.log("Redeemed:", ethers.utils.formatUnits(after.sub(before), 6), "pUSD");
}

redeem().catch(console.error);
