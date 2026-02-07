// scripts/remove-liquidity.js
const hre = require("hardhat");

async function main() {
  const contractAddress =
    process.env.CONTRACT_ADDRESS || process.argv[2];

  if (!contractAddress) {
    console.error("❌ Please provide contract address:");
    console.error(
      "   CONTRACT_ADDRESS=0x... npx hardhat run scripts/remove-liquidity.js --network coston2"
    );
    process.exit(1);
  }

  console.log("🔗 Contract:", contractAddress);
  const futures = await hre.ethers.getContractAt(
    "GasCapFutures",
    contractAddress
  );

  const [signer] = await hre.ethers.getSigners();
  console.log("👤 Liquidity Provider:", signer.address);

  const balance = await hre.ethers.provider.getBalance(
    signer.address
  );
  console.log(
    "💰 Your Wallet Balance:",
    hre.ethers.formatEther(balance),
    "FLR"
  );

  // Amount to remove, in FLR
  const amount = process.env.AMOUNT || "1";
  const amountWei = hre.ethers.parseEther(amount);

  // Current LP info
  const currentProvided = await futures.liquidityProvided(
    signer.address
  );
  const state = await futures.getContractState();
  const totalLiquidity = state[4];
  const isSettled = state[2];

  console.log("\n📊 Current LP State:");
  console.log(
    "   Total Liquidity:",
    hre.ethers.formatEther(totalLiquidity),
    "FLR"
  );
  console.log(
    "   Your Liquidity:",
    hre.ethers.formatEther(currentProvided),
    "FLR"
  );
  console.log("   Contract Settled:", isSettled);

  if (isSettled) {
    console.warn(
      "\n⚠️ Contract already settled. removeLiquidity() may not be appropriate depending on your design."
    );
  }

  if (currentProvided < amountWei) {
    console.error(
      "\n❌ You are trying to remove more liquidity than you provided."
    );
    console.error(
      "   Provided:",
      hre.ethers.formatEther(currentProvided),
      "FLR"
    );
    console.error("   Requested:", amount, "FLR");
    process.exit(1);
  }

  console.log("\n💸 Removing Liquidity:");
  console.log("   Amount:", amount, "FLR");

  try {
    // Estimate gas
    const gasEstimate = await futures.connect(signer).removeLiquidity.estimateGas(amountWei);
    console.log("⛽ Gas estimate:", gasEstimate.toString());

    console.log("\n⏳ Submitting transaction...");
    const tx = await futures.connect(signer).removeLiquidity(amountWei, {
        gasLimit: (gasEstimate * 120n) / 100n // +20% buffer
      });

    console.log("📝 Transaction submitted:", tx.hash);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
    console.log("   Gas used:", receipt.gasUsed.toString());

    // Updated state
    const newState = await futures.getContractState();
    const newTotalLiquidity = newState[4];
    const yourLiquidity = await futures.liquidityProvided(
      signer.address
    );

    console.log("\n📊 Updated LP State:");
    console.log(
      "   Total Liquidity:",
      hre.ethers.formatEther(newTotalLiquidity),
      "FLR"
    );
    console.log(
      "   Your Liquidity:",
      hre.ethers.formatEther(yourLiquidity),
      "FLR"
    );

    console.log("\n🔗 View on Explorer:");
    console.log(
      "   https://coston2-explorer.flare.network/tx/" + tx.hash
    );

    console.log("\n✅ Liquidity removed successfully!");
  } catch (error) {
    console.error("\n❌ removeLiquidity transaction failed:", error.message);
    if (error.reason) {
      console.log("Revert reason:", error.reason);
    }
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });