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
  const contractAddress =
    process.env.CONTRACT_ADDRESS || process.argv[2];

  if (!contractAddress) {
    console.error("❌ Please provide contract address:");
    console.error(
      "   CONTRACT_ADDRESS=0x... npx hardhat run scripts/interact.js --network coston2"
    );
    console.error("   OR");
    console.error(
      "   npx hardhat run scripts/interact.js --network coston2 0xYourContractAddress"
    );
    process.exit(1);
  }

  console.log("🔗 Connecting to contract:", contractAddress);
  const futures = await ethers.getContractAt("GasCapFutures", contractAddress);

  const [signer] = await ethers.getSigners();
  console.log("👤 Account:", signer.address);

  // Balance
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("💰 Balance:", formatEther(balance), "FLR\n");

  // Display menu
  console.log("📋 Available Actions (read-only):");
  console.log("1. View contract state");
  console.log("2. View current FTSO price");
  console.log("3. View market info");
  console.log("4. View my position");
  console.log("5. View my user profile");
  console.log("6. View all open positions");
  console.log("\nRunning all view functions...\n");

  // === 1. Contract State ===
  console.log("=== 1. Contract State ===");
  try {
    const state = await futures.getContractState();
    // [strikePrice, expiryTimestamp, isSettled, settlementPrice, totalLiquidity, participantCount]
    const strikePrice = state[0];
    const expiryTimestamp = Number(state[1]);
    const isSettled = state[2];
    const settlementPrice = state[3];
    const totalLiquidity = state[4];
    const participantCount = state[5];

    console.log("Strike Price:", strikePrice.toString(), "gwei");
    console.log(
      "Expiry:",
      new Date(expiryTimestamp * 1000).toLocaleString()
    );
    console.log("Is Settled:", isSettled);

    if (isSettled) {
      console.log(
        "Settlement Price:",
        settlementPrice.toString(),
        "gwei"
      );
    }

    console.log(
      "Total Liquidity:",
      formatEther(totalLiquidity),
      "FLR"
    );
    console.log("Participants (ever):", participantCount.toString());

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
      if (!isSettled) {
        console.log("⚠️  Ready for settlement!");
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  // === 2. Current FTSO Price ===
  console.log("\n=== 2. Current FTSO Price ===");
  try {
    const [price, timestamp] = await futures.getCurrentGasPrice();

    const priceGwei = Number(price) / 1e9;
    console.log("Gas Price:", priceGwei.toFixed(2), "gwei");

    const timestampNum = Number(timestamp);
    console.log(
      "Timestamp:",
      new Date(timestampNum * 1000).toLocaleString()
    );

    const state = await futures.getContractState();
    const strikePrice = Number(state[0]);
    const currentPrice = priceGwei; // already in gwei
    const diff = currentPrice - strikePrice;

    if (diff > 0) {
      console.log(
        "vs Strike: +" + diff.toFixed(2),
        "gwei (📈 Long favorable)"
      );
    } else if (diff < 0) {
      console.log(
        "vs Strike:",
        diff.toFixed(2),
        "gwei (📉 Short favorable)"
      );
    } else {
      console.log("vs Strike: At strike price");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  // === 3. Market Info ===
  console.log("\n=== 3. Market Info ===");
  try {
    const info = await futures.getMarketInfo();
    // [creator, name, description, strikePrice, expiryTimestamp, isSettled, settlementPrice]
    console.log("Creator:", info[0]);
    console.log("Name:", info[1]);
    console.log("Description:", info[2]);
    console.log("Strike (from marketInfo):", info[3].toString(), "gwei");
    console.log(
      "Expiry (from marketInfo):",
      new Date(Number(info[4]) * 1000).toLocaleString()
    );
    console.log("Is Settled:", info[5]);
    if (info[5]) {
      console.log(
        "Settlement Price:",
        info[6].toString(),
        "gwei"
      );
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  // === 4. Your Position ===
  console.log("\n=== 4. Your Position ===");
  try {
    const position = await futures.getPosition(signer.address);
    // returns:
    // [exists, isLong, quantity, collateral, leverage,
    //  marginMode, entryType, limitPrice, stopPrice,
    //  collateralAsset, settlementAsset, isActive, isClaimed]

    const exists = position[0];
    const isLong = position[1];
    const quantity = position[2];
    const collateral = position[3];
    const leverage = position[4];
    const marginMode = position[5];
    const entryType = position[6];
    const limitPrice = position[7];
    const stopPrice = position[8];
    const collateralAsset = position[9];
    const settlementAsset = position[10];
    const isActive = position[11];
    const isClaimed = position[12];

    if (exists && quantity > 0n) {
      console.log("Exists:", exists);
      console.log("Direction:", isLong ? "📈 LONG" : "📉 SHORT");
      console.log("Quantity:", quantity.toString(), "contracts");
      console.log("Collateral:", formatEther(collateral), "FLR");
      console.log("Leverage:", leverage.toString(), "x");
      console.log(
        "Margin Mode:",
        marginMode === 0 ? "ISOLATED" : "CROSS"
      );

      const entryTypes = ["MARKET", "LIMIT", "STOP"];
      console.log(
        "Entry Type:",
        entryTypes[Number(entryType)] || entryType.toString()
      );

      if (entryType === 1n) {
        console.log("Limit Price:", limitPrice.toString(), "gwei");
      }
      if (entryType === 2n) {
        console.log("Stop Price:", stopPrice.toString(), "gwei");
      }

      console.log("Collateral Asset:", collateralAsset);
      console.log("Settlement Asset:", settlementAsset);
      console.log("Active:", isActive);
      console.log("Claimed:", isClaimed);

      // Payout / P&L if settled
      const state = await futures.getContractState();
      const isSettled = state[2];

      if (isSettled) {
        try {
          const payout = await futures.calculatePayout(signer.address);
          console.log("Payout:", formatEther(payout), "FLR");

          const payoutNum = Number(payout);
          const collateralNum = Number(collateral);
          const profit = payoutNum - collateralNum;

          if (profit > 0) {
            console.log(
              "P&L: +",
              (profit / 1e18).toFixed(4),
              "FLR (📈 Profit)"
            );
          } else if (profit < 0) {
            console.log(
              "P&L:",
              (profit / 1e18).toFixed(4),
              "FLR (📉 Loss)"
            );
          } else {
            console.log("P&L: Break even");
          }
        } catch (error) {
          console.log("Payout calculation not available");
        }
      }
    } else {
      console.log("No position found");
      console.log("\nTo open a position, run:");
      console.log(
        "  npx hardhat run scripts/mint-long.js --network",
        hre.network.name
      );
      console.log(
        "  npx hardhat run scripts/mint-short.js --network",
        hre.network.name
      );
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  // === 5. Your User Profile ===
  console.log("\n=== 5. Your User Profile ===");
  try {
    const profile = await futures.getUserProfile(signer.address);
    const isRegistered = profile[0];
    const username = profile[1];
    const metadataURI = profile[2];
    const createdAt = profile[3];
    const lastLoginAt = profile[4];

    console.log("Registered:", isRegistered);
    if (isRegistered) {
      console.log("Username:", username);
      console.log("Metadata URI:", metadataURI);
      console.log(
        "Created At:",
        new Date(Number(createdAt) * 1000).toLocaleString()
      );
      console.log(
        "Last Login At:",
        new Date(Number(lastLoginAt) * 1000).toLocaleString()
      );
    } else {
      console.log(
        "This address is not registered. It will be auto-registered when you run mint-long/short scripts."
      );
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  // === 6. All Open Positions ===
  console.log("\n=== 6. All Open Positions ===");
  try {
    const result = await futures.getAllOpenPositions();
    const traders = result[0];
    const positions = result[1];

    if (traders.length === 0) {
      console.log("No active positions in this market.");
    } else {
      console.log("Active positions:", traders.length);
      for (let i = 0; i < traders.length; i++) {
        const trader = traders[i];
        const pos = positions[i];

        console.log(`\n-- Position #${i + 1} --`);
        console.log("Trader:", trader);
        console.log("  Direction:", pos.isLong ? "📈 LONG" : "📉 SHORT");
        console.log("  Quantity:", pos.quantity.toString());
        console.log("  Collateral:", formatEther(pos.collateral), "FLR");
        console.log("  Leverage:", pos.leverage.toString(), "x");
        console.log(
          "  Margin Mode:",
          pos.marginMode === 0 ? "ISOLATED" : "CROSS"
        );

        const entryTypes = ["MARKET", "LIMIT", "STOP"];
        console.log(
          "  Entry Type:",
          entryTypes[Number(pos.entryType)] || pos.entryType.toString()
        );

        if (pos.entryType === 1n) {
          console.log("  Limit Price:", pos.limitPrice.toString(), "gwei");
        }
        if (pos.entryType === 2n) {
          console.log("  Stop Price:", pos.stopPrice.toString(), "gwei");
        }

        console.log("  Collateral Asset:", pos.collateralAsset);
        console.log("  Settlement Asset:", pos.settlementAsset);
        console.log("  Active:", pos.isActive);
        console.log("  Claimed:", pos.isClaimed);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  console.log("\n💡 Tips:");
  console.log(
    "- Open positions with mint-long.js / mint-short.js (they will also register/login your user)"
  );
  console.log(
    "- View on explorer:",
    getExplorerUrl(hre.network.name, contractAddress)
  );
}

function getExplorerUrl(network, address) {
  const explorers = {
    coston2: `https://coston2-explorer.flare.network/address/${address}`,
    flare: `https://flare-explorer.flare.network/address/${address}`
  };
  return explorers[network] || explorers.coston2;
}

main().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });