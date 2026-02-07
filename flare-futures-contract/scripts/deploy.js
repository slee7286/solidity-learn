const hre = require("hardhat");

async function main() {
    console.log("🚀 Deploying fixed contract to:", hre.network.name);
    
    const GasCapFutures = await hre.ethers.getContractFactory("GasCapFutures");
    
    const strikePrice = 25; // 25 gwei
    const expiryDuration = 7 * 24 * 60 * 60; // 1 week
    
    console.log("Strike Price:", strikePrice, "gwei");
    console.log("Expiry Duration:", expiryDuration / 86400, "days");
    
    const futures = await GasCapFutures.deploy(strikePrice, expiryDuration);
    await futures.waitForDeployment();
    
    const address = await futures.getAddress();
    console.log("✅ Contract deployed to:", address);
    
    // Test the gas price function
    try {
        const [price, timestamp] = await futures.getCurrentGasPrice();
        console.log("✅ Gas price function working!");
        console.log("   Price:", hre.ethers.formatUnits(price, "gwei"), "gwei");
        console.log("   Timestamp:", new Date(Number(timestamp) * 1000).toLocaleString());
    } catch (error) {
        console.error("❌ Gas price function failed:", error.message);
    }
    
    console.log("\n🔗 Explorer:", `https://coston2-explorer.flare.network/address/${address}`);
    console.log("\n💡 Use this address:");
    console.log(`export CONTRACT_ADDRESS=${address}`);
    
    // Test contract state
    const state = await futures.getContractState();
    console.log("\n📊 Contract State:");
    console.log("   Strike Price:", state._strikePrice.toString(), "gwei");
    console.log("   Expiry:", new Date(Number(state._expiryTimestamp) * 1000).toLocaleString());
}

main().catch(console.error);
