// scripts/mint-short.js
const hre = require("hardhat");

async function main() {
    // Get contract address
    const contractAddress = process.env.CONTRACT_ADDRESS || process.argv[2];
    
    if (!contractAddress) {
        console.error("❌ Please provide contract address:");
        console.error("   CONTRACT_ADDRESS=0x... npx hardhat run scripts/mint-short.js --network coston2");
        process.exit(1);
    }
    
    console.log("🔗 Contract:", contractAddress);
    const futures = await hre.ethers.getContractAt("GasCapFutures", contractAddress);
    
    const [signer] = await hre.ethers.getSigners();
    console.log("👤 Trader:", signer.address);
    
    // Get parameters from environment or use defaults
    const quantity = parseInt(process.env.QUANTITY || "10");
    const collateral = process.env.COLLATERAL || "1"; // in FLR
    
    console.log("\n📉 Opening SHORT Position:");
    console.log("   Quantity:", quantity, "contracts");
    console.log("   Collateral:", collateral, "FLR");
    
    // Check current price
    const [currentPrice] = await futures.getCurrentGasPrice();
    const state = await futures.getContractState();
    console.log("\n💹 Market Info:");
    console.log("   Current Price:", currentPrice.toString(), "gwei");
    console.log("   Strike Price:", state._strikePrice.toString(), "gwei");
    
    if (currentPrice < state._strikePrice) {
        console.log("   Status: 📉 Below strike (Short currently profitable)");
    } else {
        console.log("   Status: 📈 Above strike (Long currently profitable)");
    }
    
    // Confirm
    console.log("\n⚠️  You are betting that gas price will be BELOW", state._strikePrice.toString(), "gwei at expiry");
    console.log("   Expiry:", new Date(state._expiryTimestamp * 1000).toLocaleString());
    
    console.log("\n⏳ Submitting transaction...");
    const tx = await futures.mintFuture(
        false, // isLong = false (SHORT)
        quantity,
        { value: hre.ethers.utils.parseEther(collateral) }
    );
    
    console.log("📝 Transaction submitted:", tx.hash);
    console.log("⏳ Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
    
    // Show updated position
    console.log("\n📊 Your Position:");
    const position = await futures.getPosition(signer.address);
    console.log("   Direction: 📉 SHORT");
    console.log("   Quantity:", position.quantity.toString(), "contracts");
    console.log("   Collateral:", hre.ethers.utils.formatEther(position.collateral), "FLR");
    
    console.log("\n🔗 View on Explorer:");
    console.log("   https://coston2-explorer.flare.network/tx/" + tx.hash);
    
    console.log("\n✅ Position opened successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.message);
        process.exit(1);
    });
