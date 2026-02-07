// scripts/claim.js
const hre = require("hardhat");

async function main() {
    const contractAddress = process.env.CONTRACT_ADDRESS || process.argv[2];
    
    if (!contractAddress) {
        console.error("❌ Please provide contract address:");
        console.error("   CONTRACT_ADDRESS=0x... npx hardhat run scripts/claim.js --network coston2");
        process.exit(1);
    }
    
    console.log("🔗 Contract:", contractAddress);
    const futures = await hre.ethers.getContractAt("GasCapFutures", contractAddress);
    
    const [signer] = await hre.ethers.getSigners();
    console.log("👤 Trader:", signer.address);
    
    const initialBalance = await signer.getBalance();
    console.log("💰 Initial Balance:", hre.ethers.utils.formatEther(initialBalance), "FLR");
    
    // Check contract state
    const state = await futures.getContractState();
    
    console.log("\n📊 Contract State:");
    console.log("   Is Settled:", state._isSettled);
    
    if (!state._isSettled) {
        console.log("\n❌ Contract is not settled yet!");
        console.log("   Settlement must be triggered first.");
        console.log("\n💡 To settle:");
        console.log("   CONTRACT_ADDRESS=" + contractAddress, "npx hardhat run scripts/settle.js --network coston2");
        process.exit(1);
    }
    
    console.log("   Settlement Price:", state._settlementPrice.toString(), "gwei");
    console.log("   Strike Price:", state._strikePrice.toString(), "gwei");
    
    // Check user's position
    console.log("\n📊 Your Position:");
    const position = await futures.getPosition(signer.address);
    
    if (position.quantity.eq(0)) {
        console.log("\n❌ You don't have any position in this contract!");
        process.exit(1);
    }
    
    console.log("   Direction:", position.isLong ? "📈 LONG" : "📉 SHORT");
    console.log("   Quantity:", position.quantity.toString(), "contracts");
    console.log("   Collateral:", hre.ethers.utils.formatEther(position.collateral), "FLR");
    console.log("   Already Claimed:", position.isClaimed);
    
    if (position.isClaimed) {
        console.log("\n✅ You have already claimed your payout!");
        process.exit(0);
    }
    
    // Calculate payout
    console.log("\n💰 Calculating Payout...");
    const payout = await futures.calculatePayout(signer.address);
    console.log("   Total Payout:", hre.ethers.utils.formatEther(payout), "FLR");
    console.log("   Collateral:", hre.ethers.utils.formatEther(position.collateral), "FLR");
    
    const profit = payout.sub(position.collateral);
    if (profit.gt(0)) {
        console.log("   Profit: +", hre.ethers.utils.formatEther(profit), "FLR 🎉");
    } else if (profit.lt(0)) {
        console.log("   Loss:", hre.ethers.utils.formatEther(profit), "FLR 📉");
    } else {
        console.log("   Break even ➡️");
    }
    
    // Show result explanation
    console.log("\n📊 Settlement Analysis:");
    const priceDiff = state._settlementPrice - state._strikePrice;
    if (priceDiff > 0) {
        console.log("   Price went UP by", priceDiff.toString(), "gwei from strike");
        if (position.isLong) {
            console.log("   ✅ Your LONG position won!");
        } else {
            console.log("   ❌ Your SHORT position lost");
        }
    } else if (priceDiff < 0) {
        console.log("   Price went DOWN by", Math.abs(priceDiff).toString(), "gwei from strike");
        if (position.isLong) {
            console.log("   ❌ Your LONG position lost");
        } else {
            console.log("   ✅ Your SHORT position won!");
        }
    } else {
        console.log("   Price stayed at strike (draw)");
    }
    
    if (payout.eq(0)) {
        console.log("\n⚠️  Your payout is 0 (max loss = collateral)");
        console.log("   No need to claim.");
        process.exit(0);
    }
    
    console.log("\n⏳ Claiming payout...");
    const tx = await futures.claimPayout();
    
    console.log("📝 Transaction submitted:", tx.hash);
    console.log("⏳ Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
    
    // Check new balance
    const newBalance = await signer.getBalance();
    const balanceIncrease = newBalance.sub(initialBalance);
    
    console.log("\n💰 Payout Received!");
    console.log("   Initial Balance:", hre.ethers.utils.formatEther(initialBalance), "FLR");
    console.log("   New Balance:", hre.ethers.utils.formatEther(newBalance), "FLR");
    console.log("   Net Change:", hre.ethers.utils.formatEther(balanceIncrease), "FLR");
    console.log("   (includes gas fees)");
    
    console.log("\n🔗 View on Explorer:");
    console.log("   https://coston2-explorer.flare.network/tx/" + tx.hash);
    
    console.log("\n🎉 Claim successful!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.message);
        process.exit(1);
    });
