// scripts/settle.js
const hre = require("hardhat");

async function main() {
    const contractAddress = process.env.CONTRACT_ADDRESS || process.argv[2];
    
    if (!contractAddress) {
        console.error("❌ Please provide contract address:");
        console.error("   CONTRACT_ADDRESS=0x... npx hardhat run scripts/settle.js --network coston2");
        process.exit(1);
    }
    
    console.log("🔗 Contract:", contractAddress);
    const futures = await hre.ethers.getContractAt("GasCapFutures", contractAddress);
    
    const [signer] = await hre.ethers.getSigners();
    console.log("👤 Settler:", signer.address);
    
    // Check contract state
    const state = await futures.getContractState();
    
    console.log("\n📊 Contract State:");
    console.log("   Strike Price:", state._strikePrice.toString(), "gwei");
    
    // ✅ FIXED: Convert BigInt to Number for date operations
    const expiryTimestamp = Number(state._expiryTimestamp);
    console.log("   Expiry:", new Date(expiryTimestamp * 1000).toLocaleString());
    console.log("   Is Settled:", state._isSettled);
    
    if (state._isSettled) {
        console.log("\n✅ Contract is already settled!");
        console.log("   Settlement Price:", state._settlementPrice.toString(), "gwei");
        
        // ✅ FIXED: Convert BigInt to Number for comparisons
        const settlementPrice = Number(state._settlementPrice);
        const strikePrice = Number(state._strikePrice);
        
        // Show if strike was hit
        if (settlementPrice > strikePrice) {
            const diff = settlementPrice - strikePrice;
            console.log("   Result: 📈 Price went UP by", diff.toString(), "gwei (Longs win)");
        } else if (settlementPrice < strikePrice) {
            const diff = strikePrice - settlementPrice;
            console.log("   Result: 📉 Price went DOWN by", diff.toString(), "gwei (Shorts win)");
        } else {
            console.log("   Result: ➡️  Exactly at strike (Draw)");
        }
        
        console.log("\n💡 Traders can now claim payouts with:");
        console.log("   CONTRACT_ADDRESS=" + contractAddress, "npx hardhat run scripts/claim.js --network coston2");
        return;
    }
    
    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    const timeToExpiry = expiryTimestamp - now;
    
    if (timeToExpiry > 0) {
        console.log("\n❌ Contract has not expired yet!");
        const days = Math.floor(timeToExpiry / 86400);
        const hours = Math.floor((timeToExpiry % 86400) / 3600);
        const minutes = Math.floor((timeToExpiry % 3600) / 60);
        console.log("   Time remaining:", `${days}d ${hours}h ${minutes}m`);
        console.log("\n💡 Settlement can be triggered after:", new Date(expiryTimestamp * 1000).toLocaleString());
        process.exit(1);
    }
    
    console.log("\n✅ Contract has expired! Ready for settlement.");
    
    // Get current FTSO price
    console.log("\n📊 Fetching FTSO price...");
    try {
        const [currentPrice, timestamp] = await futures.getCurrentGasPrice();
        
        // ✅ FIXED: Convert BigInt to Number for price operations
        const currentPriceNum = Number(currentPrice);
        const strikePriceNum = Number(state._strikePrice);
        const timestampNum = Number(timestamp);
        
        // Convert from wei to gwei for display
        const currentPriceGwei = currentPriceNum / 1e9;
        console.log("   Current Price:", currentPriceGwei.toFixed(2), "gwei");
        console.log("   Price Timestamp:", new Date(timestampNum * 1000).toLocaleString());
        console.log("   Strike Price:", strikePriceNum.toString(), "gwei");
        
        if (currentPriceGwei > strikePriceNum) {
            const diff = currentPriceGwei - strikePriceNum;
            console.log("   Expected Result: 📈 Longs win by", diff.toFixed(2), "gwei");
        } else if (currentPriceGwei < strikePriceNum) {
            const diff = strikePriceNum - currentPriceGwei;
            console.log("   Expected Result: 📉 Shorts win by", diff.toFixed(2), "gwei");
        } else {
            console.log("   Expected Result: ➡️  Draw");
        }
    } catch (error) {
        console.log("   ⚠️  Could not fetch current price:", error.message);
        console.log("   Settlement will use FTSO data at settlement time");
    }
    
    console.log("\n⏳ Settling contract...");
    console.log("   (This will use FTSO oracle data for final settlement price)");
    
    try {
        // Estimate gas first
        const gasEstimate = await futures.settleContract.estimateGas();
        console.log("   Gas estimate:", gasEstimate.toString());
        
        const tx = await futures.settleContract({
            gasLimit: (gasEstimate * 120n) / 100n // Add 20% buffer
        });
        
        console.log("📝 Transaction submitted:", tx.hash);
        console.log("⏳ Waiting for confirmation...");
        
        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
        console.log("   Gas used:", receipt.gasUsed.toString());
        
        // Get final settlement details
        const newState = await futures.getContractState();
        
        console.log("\n🎉 Contract Settled!");
        console.log("\n📊 Settlement Details:");
        console.log("   Settlement Price:", newState._settlementPrice.toString(), "gwei");
        console.log("   Strike Price:", newState._strikePrice.toString(), "gwei");
        
        // ✅ FIXED: Convert BigInt to Number for final comparisons
        const finalSettlementPrice = Number(newState._settlementPrice);
        const finalStrikePrice = Number(newState._strikePrice);
        
        if (finalSettlementPrice > finalStrikePrice) {
            const diff = finalSettlementPrice - finalStrikePrice;
            console.log("   Result: 📈 Price went UP by", diff.toString(), "gwei");
            console.log("   Winners: LONG positions");
        } else if (finalSettlementPrice < finalStrikePrice) {
            const diff = finalStrikePrice - finalSettlementPrice;
            console.log("   Result: 📉 Price went DOWN by", diff.toString(), "gwei");
            console.log("   Winners: SHORT positions");
        } else {
            console.log("   Result: ➡️  Exactly at strike");
            console.log("   Winners: Draw (collateral returned)");
        }
        
        console.log("\n🔗 View on Explorer:");
        console.log("   https://coston2-explorer.flare.network/tx/" + tx.hash);
        
        console.log("\n✅ Settlement complete!");
        console.log("\n💰 Traders can now claim their payouts with:");
        console.log("   CONTRACT_ADDRESS=" + contractAddress, "npx hardhat run scripts/claim.js --network coston2");
        
    } catch (error) {
        console.error("\n❌ Settlement failed:", error.message);
        
        if (error.message.includes("Not yet expired")) {
            console.log("💡 Contract has not expired yet. Wait until expiry time.");
        } else if (error.message.includes("Already settled")) {
            console.log("💡 Contract is already settled.");
        } else if (error.message.includes("FTSO data too old")) {
            console.log("💡 FTSO price data is too old. Try again in a few minutes.");
        } else {
            console.log("💡 Check the contract state and try again.");
        }
        
        process.exit(1);
    }
}

main().then(() => process.exit(0)).catch((error) => {
        console.error("\n❌ Error:", error.message);
        process.exit(1);
    });