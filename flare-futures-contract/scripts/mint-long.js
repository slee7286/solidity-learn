// scripts/mint-long.js
const hre = require("hardhat");

async function main() {
    const contractAddress = process.env.CONTRACT_ADDRESS || "0xe94D9C7a256aD5F05Cd55628fFA6D867c1D800aA";
    
    console.log("🔗 Contract:", contractAddress);
    
    const [signer] = await hre.ethers.getSigners();
    console.log("👤 Trader:", signer.address);
    
    // Check balance first
    const balance = await hre.ethers.provider.getBalance(signer.address);
    console.log("💰 Balance:", hre.ethers.formatEther(balance), "C2FLR");
    
    const futures = await hre.ethers.getContractAt("GasCapFutures", contractAddress);
    
    // Check contract state first
    console.log("\n🔍 Checking contract state...");
    try {
        const state = await futures.getContractState();
        console.log("Strike Price:", state._strikePrice.toString(), "gwei");
        console.log("Expiry:", new Date(Number(state._expiryTimestamp) * 1000).toLocaleString());
        console.log("Is Settled:", state._isSettled);
        
        const now = Math.floor(Date.now() / 1000);
        if (Number(state._expiryTimestamp) <= now) {
            console.error("❌ Contract has expired!");
            return;
        }
        
        if (state._isSettled) {
            console.error("❌ Contract is already settled!");
            return;
        }
        
    } catch (error) {
        console.error("❌ Failed to get contract state:", error.message);
        return;
    }
    
    // Check current gas price
    try {
        const [currentPrice, timestamp] = await futures.getCurrentGasPrice();
        console.log("Current Gas Price:", currentPrice.toString(), "gwei");
        console.log("Price Timestamp:", new Date(Number(timestamp) * 1000).toLocaleString());
    } catch (error) {
        console.error("❌ Failed to get current gas price:", error.message);
        return;
    }
    
    const quantity = 10;
    const collateralAmount = hre.ethers.parseEther("1"); // 1 FLR
    
    console.log("\n📈 Opening LONG Position:");
    console.log("   Quantity:", quantity, "contracts");
    console.log("   Collateral:", hre.ethers.formatEther(collateralAmount), "FLR");
    
    try {
        // Check if we already have a position
        const existingPosition = await futures.getPosition(signer.address);
        if (Number(existingPosition.quantity) > 0) {
            console.error("❌ You already have a position!");
            console.log("   Direction:", existingPosition.isLong ? "LONG" : "SHORT");
            console.log("   Quantity:", existingPosition.quantity.toString());
            return;
        }
        
        // Estimate gas first
        console.log("\n⛽ Estimating gas...");
        const gasEstimate = await futures.mintLong.estimateGas(quantity, {
            value: collateralAmount
        });
        console.log("Gas estimate:", gasEstimate.toString());
        
        // Check if we have enough balance for gas + collateral
        const gasPrice = await hre.ethers.provider.getFeeData();
        const gasCost = gasEstimate * gasPrice.gasPrice;
        const totalCost = collateralAmount + gasCost;
        
        if (balance < totalCost) {
            console.error("❌ Insufficient balance!");
            console.log("   Required:", hre.ethers.formatEther(totalCost), "C2FLR");
            console.log("   Available:", hre.ethers.formatEther(balance), "C2FLR");
            console.log("   Shortfall:", hre.ethers.formatEther(totalCost - balance), "C2FLR");
            return;
        }
        
        // Execute the transaction
        console.log("\n🚀 Executing transaction...");
        const tx = await futures.mintLong(quantity, {
            value: collateralAmount,
            gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
        });
        
        console.log("📝 Transaction hash:", tx.hash);
        console.log("⏳ Waiting for confirmation...");
        
        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed!");
        console.log("   Block:", receipt.blockNumber);
        console.log("   Gas used:", receipt.gasUsed.toString());
        
        // Check the new position
        const newPosition = await futures.getPosition(signer.address);
        console.log("\n🎉 Position created:");
        console.log("   Direction: 📈 LONG");
        console.log("   Quantity:", newPosition.quantity.toString(), "contracts");
        console.log("   Collateral:", hre.ethers.formatEther(newPosition.collateral), "FLR");
        
    } catch (error) {
        console.error("\n❌ Transaction failed:");
        console.error("Error:", error.message);
        
        // Try to decode the revert reason
        if (error.data) {
            console.log("Error data:", error.data);
        }
        
        // Common error suggestions
        console.log("\n💡 Possible causes:");
        console.log("   1. Contract validation failed (check require statements)");
        console.log("   2. Insufficient collateral amount");
        console.log("   3. Invalid quantity (must be > 0)");
        console.log("   4. Contract paused or in wrong state");
        console.log("   5. Gas limit too low");
        
        // If it's a revert with reason, try to extract it
        if (error.reason) {
            console.log("   Revert reason:", error.reason);
        }
    }
}

main().then(() => process.exit(0)).catch((error) => {
        console.error(error);
        process.exit(1);
    });