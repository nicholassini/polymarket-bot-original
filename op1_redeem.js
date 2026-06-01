require("dotenv").config();
const { ethers } = require("ethers");

async function redeem() {
  const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");
  const wallet   = new ethers.Wallet(process.env.POLYMARKET_PRIVATE_KEY, provider);
  console.log("Wallet:", wallet.address);

  const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
  const pUSD_ADDR   = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

  // Position DB id=8: "Under" outcome index 1, indexSet = 2
  const conditionId = "0xff599a51b89bad7aee3e5efb2238f58420cdc05fe7a24ca48f77e24bc8245f9e";
  const tokenId     = "96879728524724829206778105208231612105108933371818952028537619813955011537087";
  const INDEX_SET   = 2; // outcome 1 = bitmask 10 = 2

  const ctf = new ethers.Contract(CTF_ADDRESS, [
    "function redeemPositions(address,bytes32,bytes32,uint256[]) external",
    "function balanceOf(address,uint256) view returns (uint256)"
  ], wallet);

  const pUSDContract = new ethers.Contract(pUSD_ADDR, [
    "function balanceOf(address) view returns (uint256)"
  ], provider);

  // Record pre-state
  const pUSDpre = await pUSDContract.balanceOf(wallet.address);
  const ctfBalPre = await ctf.balanceOf(wallet.address, tokenId);
  console.log("pUSD before:     ", ethers.utils.formatUnits(pUSDpre, 6), "(raw:", pUSDpre.toString() + ")");
  console.log("CTF token before:", ethers.utils.formatUnits(ctfBalPre, 6), "(raw:", ctfBalPre.toString() + ")");

  if (ctfBalPre.eq(0)) {
    console.error("HALT: CTF token balance is zero. Nothing to redeem.");
    process.exit(1);
  }

  // Submit redemption
  console.log("\nSubmitting redeemPositions(pUSD, 0x0, conditionId, [" + INDEX_SET + "])...");
  const tx = await ctf.redeemPositions(
    pUSD_ADDR,
    ethers.constants.HashZero,
    conditionId,
    [INDEX_SET],
    {
      maxPriorityFeePerGas: ethers.utils.parseUnits("35", "gwei"),
      maxFeePerGas:         ethers.utils.parseUnits("150", "gwei"),
      gasLimit: 300000
    }
  );
  console.log("Tx hash:", tx.hash);
  console.log("Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("Confirmed in block", receipt.blockNumber, "| gas used:", receipt.gasUsed.toString(), "| status:", receipt.status);

  if (receipt.status !== 1) {
    console.error("HALT: Transaction REVERTED. Do not update DB.");
    process.exit(1);
  }

  // Post-flight
  const pUSDpost  = await pUSDContract.balanceOf(wallet.address);
  const ctfBalPost = await ctf.balanceOf(wallet.address, tokenId);

  console.log("\n=== POST-FLIGHT ===");
  console.log("pUSD after:      ", ethers.utils.formatUnits(pUSDpost, 6), "(raw:", pUSDpost.toString() + ")");
  console.log("CTF token after: ", ethers.utils.formatUnits(ctfBalPost, 6), "(raw:", ctfBalPost.toString() + ")");

  const gained = pUSDpost.sub(pUSDpre);
  console.log("pUSD gained:     ", ethers.utils.formatUnits(gained, 6), "(raw:", gained.toString() + ")");

  if (gained.lte(0)) {
    console.error("HALT: pUSD did NOT increase. Investigate before touching DB.");
    process.exit(1);
  }

  console.log("\n=== READY FOR DB UPDATE ===");
  console.log("DB id=8: set status='closed', realized_pnl =", ethers.utils.formatUnits(gained, 6), "- 2.45 =",
    (parseFloat(ethers.utils.formatUnits(gained, 6)) - 2.45).toFixed(6));
  console.log("Exact redeemed_amount (raw):", gained.toString());
}

redeem().catch(e => { console.error("FATAL:", e.message || e); process.exit(1); });
