// scripts/add-liquidity.js
const hre = require("hardhat");

async function main() {
  const contractAddress =
    process.env.CONTRACT_ADDRESS || process.argv[2];

  if (!contractAddress) {
    console.error("❌ Please provide contract address:");
    console.error(
      "   CONTRACT_ADDRESS=0x... npx hardhat run scripts/add-liquidity.js --network coston2"
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

  // ✅ get balance from provider, not signer.getBalance()
  const balance = await hre.ethers.provider.getBalance(
    signer.address
  );
  console.log(
    "💰 Your Balance:",
    hre.ethers.formatEther(balance),
    "FLR"
  );

  // Get amount from environment or use default
  const amount = process.env.AMOUNT || "10"; // in FLR

  console.log("\n💰 Adding Liquidity:");
  console.log("   Amount:", amount, "FLR");

  // Current contract state
  const state = await futures.getContractState();
  // [strikePrice, expiryTimestamp, isSettled, settlementPrice, totalLiquidity, participantCount]
  const totalLiquidity = state[4];
  const participantCount = state[5];
  const isSettled = state[2];

  console.log("\n📊 Current Contract State:");
  console.log(
    "   Total Liquidity:",
    hre.ethers.formatEther(totalLiquidity),
    "FLR"
  );
  console.log("   Participants:", participantCount.toString());
  console.log("   Is Settled:", isSettled);

  if (isSettled) {
    console.error(
      "\n❌ Cannot add liquidity - contract is already settled!"
    );
    process.exit(1);
  }

  // Check if user has enough balance
  const amountWei = hre.ethers.parseEther(amount);
  if (balance < amountWei) {
    console.error("\n❌ Insufficient balance!");
    console.error("   Required:", amount, "FLR");
    console.error(
      "   Available:",
      hre.ethers.formatEther(balance),
      "FLR"
    );
    process.exit(1);
  }

  console.log("\n⏳ Submitting transaction...");
  const tx = await futures.addLiquidity({
    value: amountWei
  });

  console.log("📝 Transaction submitted:", tx.hash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

  // Updated state
  const newState = await futures.getContractState();
  const newTotalLiquidity = newState[4];
  const yourLiquidity = await futures.liquidityProvided(
    signer.address
  );

  console.log("\n📊 Updated Contract State:");
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

  console.log("\n✅ Liquidity added successfully!");
  console.log(
    "\n💡 Note: You can remove liquidity before settlement with:"
  );
  console.log(
    "   CONTRACT_ADDRESS=" + contractAddress,
    "npx hardhat run scripts/remove-liquidity.js --network coston2"
  );
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });