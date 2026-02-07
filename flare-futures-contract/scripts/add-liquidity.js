// scripts/add-liquidity.js
const hre = require("hardhat");

async function main() {
    const contractAddress = process.env.CONTRACT_ADDRESS || process.argv[2];
    
    if (!contractAddress) {
        console.error("❌ Please provide contract address:");
        console.error("   CONTRACT_ADDRESS=0x... npx hardhat run scripts/add-liquidity.js --network coston2");
        process.exit(1);
    }
    
    console.log("🔗 Contract:", contractAddress);
    const futures = await hre.ethers.getContractAt("GasCapFutures", contractAddress);
    
    const [signer] = await hre.ethers.getSigners();
    console.log("👤 Liquidity Provider:", signer.address);
    
    const balance = await signer.getBalance();
    console.log("💰 Your Balance:", hre.ethers.utils.formatEther(balance), "FLR");
    
    // Get amount from environment or use default
    const amount = process.env.AMOUNT || "10"; // in FLR
    
    console.log("\n💰 Adding Liquidity:");
    console.log("   Amount:", amount, "FLR");
    
    // Check current contract state
    const state = await futures.getContractState();
    console.log("\n📊 Current Contract State:");
    console.log("   Total Liquidity:", hre.ethers.utils.formatEther(state._totalLiquidity), "FLR");
    console.log("   Participants:", state._participantCount.toString());
    console.log("   Is Settled:", state._isSettled);
    
    if (state._isSettled) {
        console.error("\n❌ Cannot add liquidity - contract is already settled!");
        process.exit(1);
    }
    
    // Check if user has enough balance
    const amountWei = hre.ethers.utils.parseEther(amount);
    if (balance.lt(amountWei)) {
        console.error("\n❌ Insufficient balance!");
        console.error("   Required:", amount, "FLR");
        console.error("   Available:", hre.ethers.utils.formatEther(balance), "FLR");
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
    
    // Show updated state
    const newState = await futures.getContractState();
    const yourLiquidity = await futures.liquidityProvided(signer.address);
    
    console.log("\n📊 Updated Contract State:");
    console.log("   Total Liquidity:", hre.ethers.utils.formatEther(newState._totalLiquidity), "FLR");
    console.log("   Your Liquidity:", hre.ethers.utils.formatEther(yourLiquidity), "FLR");
    
    console.log("\n🔗 View on Explorer:");
    console.log("   https://coston2-explorer.flare.network/tx/" + tx.hash);
    
    console.log("\n✅ Liquidity added successfully!");
    console.log("\n💡 Note: You can remove liquidity before settlement with:");
    console.log("   CONTRACT_ADDRESS=" + contractAddress, "npx hardhat run scripts/remove-liquidity.js --network coston2");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.message);
        process.exit(1);
    });
