const hre = require("hardhat");
const { ethers } = require("hardhat");

// Helper function for Ethers v6 BigInt handling
function formatEther(wei) {
    try {
        if (hre.ethers.formatEther) {
            return hre.ethers.formatEther(wei);
        }
        if (ethers.formatEther) {
            return ethers.formatEther(wei);
        }
        if (ethers.utils?.formatEther) {
            return ethers.utils.formatEther(wei);
        }
        return (Number(wei) / 1e18).toFixed(4);
    } catch (error) {
        return (Number(wei) / 1e18).toFixed(4);
    }
}

async function main() {
    // Get contract address from environment or command line
    const contractAddress = process.env.CONTRACT_ADDRESS || process.argv[2];
    
    if (!contractAddress) {
        console.error("❌ Please provide contract address:");
        console.error("   CONTRACT_ADDRESS=0x... npx hardhat run scripts/interact.js --network coston2");
        console.error("   OR");
        console.error("   npx hardhat run scripts/interact.js --network coston2 0xYourContractAddress");
        process.exit(1);
    }
    
    console.log("🔗 Connecting to contract:", contractAddress);
    const futures = await ethers.getContractAt("GasCapFutures", contractAddress);
    
    const [signer] = await ethers.getSigners();
    console.log("👤 Account:", signer.address);
    
    // ✅ FIXED: Use helper function for balance
    const balance = await ethers.provider.getBalance(signer.address);
    console.log("💰 Balance:", formatEther(balance), "FLR\n");
    
    // Display menu
    console.log("📋 Available Actions:");
    console.log("1. View contract state");
    console.log("2. View current FTSO price");
    console.log("3. Mint long position");
    console.log("4. Mint short position");
    console.log("5. Add liquidity");
    console.log("6. View my position");
    console.log("7. Settle contract (if expired)");
    console.log("8. Claim payout (if settled)");
    console.log("\nRunning all view functions...\n");
    
    // 1. Contract State
    console.log("=== 1. Contract State ===");
    try {
        const state = await futures.getContractState();
        console.log("Strike Price:", state._strikePrice.toString(), "gwei");
        
        // ✅ FIXED: Convert BigInt to Number for date operations
        const expiryTimestamp = Number(state._expiryTimestamp);
        console.log("Expiry:", new Date(expiryTimestamp * 1000).toLocaleString());
        console.log("Is Settled:", state._isSettled);
        
        if (state._isSettled) {
            console.log("Settlement Price:", state._settlementPrice.toString(), "gwei");
        }
        
        // ✅ FIXED: Use helper function for formatting
        console.log("Total Liquidity:", formatEther(state._totalLiquidity), "FLR");
        console.log("Participants:", state._participantCount.toString());
        
        // Check if expired
        const now = Math.floor(Date.now() / 1000);
        const timeToExpiry = expiryTimestamp - now;
        if (timeToExpiry > 0) {
            console.log("Status: ⏳ Active");
            const days = Math.floor(timeToExpiry / 86400);
            const hours = Math.floor((timeToExpiry % 86400) / 3600);
            console.log("Time to Expiry:", `${days}d ${hours}h`);
        } else {
            console.log("Status: ⏰ Expired");
            if (!state._isSettled) {
                console.log("⚠️  Ready for settlement!");
            }
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
    
    // 2. Current FTSO Price
    console.log("\n=== 2. Current FTSO Price ===");
    try {
        const [price, timestamp] = await futures.getCurrentGasPrice();
        
        // ✅ FIXED: Convert BigInt to Number for formatting
        const priceGwei = Number(price) / 1e9;
        console.log("Gas Price:", priceGwei.toFixed(2), "gwei");
        
        const timestampNum = Number(timestamp);
        console.log("Timestamp:", new Date(timestampNum * 1000).toLocaleString());
        
        const state = await futures.getContractState();
        
        // ✅ FIXED: Safe BigInt comparison
        const strikePrice = Number(state._strikePrice);
        const currentPrice = Number(price) / 1e9; // Convert to gwei
        const diff = currentPrice - strikePrice;
        
        if (diff > 0) {
            console.log("vs Strike: +" + diff.toFixed(2), "gwei (📈 Long favorable)");
        } else if (diff < 0) {
            console.log("vs Strike:", diff.toFixed(2), "gwei (📉 Short favorable)");
        } else {
            console.log("vs Strike: At strike price");
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
    
    // 6. Your Position
    console.log("\n=== 6. Your Position ===");
    try {
        const position = await futures.getPosition(signer.address);
        
        // ✅ FIXED: Use Number() instead of.gt() for BigInt
        if (Number(position.quantity) > 0) {
            console.log("Direction:", position.isLong ? "📈 LONG" : "📉 SHORT");
            console.log("Quantity:", position.quantity.toString(), "contracts");
            console.log("Collateral:", formatEther(position.collateral), "FLR");
            console.log("Claimed:", position.isClaimed);
            
            // Try to calculate payout if settled
            const state = await futures.getContractState();
            if (state._isSettled) {
                try {
                    const payout = await futures.calculatePayout(signer.address);
                    console.log("Payout:", formatEther(payout), "FLR");
                    
                    // ✅ FIXED: Safe BigInt arithmetic
                    const payoutNum = Number(payout);
                    const collateralNum = Number(position.collateral);
                    const profit = payoutNum - collateralNum;
                    
                    if (profit > 0) {
                        console.log("P&L: +", (profit / 1e18).toFixed(4), "FLR (📈 Profit)");
                    } else if (profit < 0) {
                        console.log("P&L:", (profit / 1e18).toFixed(4), "FLR (📉 Loss)");
                    } else {
                        console.log("P&L: Break even");
                    }
                } catch (error) {
                    // Payout calculation might fail if not settled
                    console.log("Payout calculation not available");
                }
            }
        } else {
            console.log("No position found");
            console.log("\nTo open a position, run:");
            console.log("  npx hardhat run scripts/mint-long.js --network", hre.network.name);
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
    
    console.log("\n💡 Tips:");
    console.log("- Use the example scripts in scripts/examples/ for specific actions");
    console.log("- Monitor with: CONTRACT_ADDRESS=" + contractAddress, "npm run monitor");
    console.log("- View on explorer:", getExplorerUrl(hre.network.name, contractAddress));
}

function getExplorerUrl(network, address) {
    const explorers = {
        coston2: `https://coston2-explorer.flare.network/address/${address}`,
        flare: `https://flare-explorer.flare.network/address/${address}`,
    };
    return explorers[network] || explorers.coston2;
}

main().then(() => process.exit(0)).catch((error) => {
        console.error(error);
        process.exit(1);
    });