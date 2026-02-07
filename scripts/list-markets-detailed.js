// scripts/list-markets-detailed.js
const hre = require("hardhat");

function formatEther(v) {
  return hre.ethers.formatEther(v);
}

async function main() {
  const factoryAddress =
    process.env.FACTORY_ADDRESS || process.argv[2];

  if (!factoryAddress) {
    console.error("❌ Please provide factory address:");
    console.error(
      "   FACTORY_ADDRESS=0x... npx hardhat run scripts/list-markets-detailed.js --network coston2"
    );
    process.exit(1);
  }

  const factory = await hre.ethers.getContractAt(
    "GasCapFuturesFactory",
    factoryAddress
  );

  const count = await factory.marketsCount();
  console.log("🏭 Factory:", factoryAddress);
  console.log("📊 Total markets:", count.toString());

  if (count === 0n) {
    console.log("No markets yet.");
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  const active = [];
  const expiredNotSettled = [];
  const settled = [];

  // Collect detailed info for each market
  for (let i = 0n; i < count; i++) {
    const [marketAddr, creator, createdAt] =
      await factory.getMarket(i);

    const market = await hre.ethers.getContractAt(
      "GasCapFutures",
      marketAddr
    );

    // Contract state
    const state = await market.getContractState();
    const strikePrice = state[0];
    const expiryTimestamp = Number(state[1]);
    const isSettled = state[2];
    const settlementPrice = state[3];
    const totalLiquidity = state[4];
    const participantCount = state[5];

    // Market metadata
    const info = await market.getMarketInfo();
    const name = info[1];
    const description = info[2];

    const status = {
      index: i,
      address: marketAddr,
      creator,
      createdAt: Number(createdAt),
      strikePrice,
      expiryTimestamp,
      isSettled,
      settlementPrice,
      totalLiquidity,
      participantCount,
      name,
      description
    };

    if (isSettled) {
      settled.push(status);
    } else if (expiryTimestamp <= now) {
      expiredNotSettled.push(status);
    } else {
      active.push(status);
    }
  }

  // Helper to print markets + their active positions
  async function printMarkets(title, list) {
    console.log(`\n=== ${title} (${list.length}) ===`);
    if (list.length === 0) {
      console.log("  (none)");
      return;
    }

    for (const m of list) {
      console.log(`\n#${m.index.toString()}  ${m.address}`);
      console.log("  Name:", m.name);
      console.log("  Description:", m.description);
      console.log("  Creator:", m.creator);
      console.log(
        "  Created:",
        new Date(m.createdAt * 1000).toLocaleString()
      );
      console.log("  Strike:", m.strikePrice.toString(), "gwei");
      console.log(
        "  Expiry:",
        new Date(m.expiryTimestamp * 1000).toLocaleString()
      );
      console.log(
        "  Total Liquidity:",
        formatEther(m.totalLiquidity),
        "FLR"
      );
      console.log(
        "  Participants:",
        m.participantCount.toString()
      );
      if (m.isSettled) {
        console.log(
          "  Settlement Price:",
          m.settlementPrice.toString(),
          "gwei"
        );
      }

      // ---- List positions for this market ----
      const market = await hre.ethers.getContractAt(
        "GasCapFutures",
        m.address
      );

      try {
        // getActiveTraders(): address[]
        const traders = await market.getActiveTraders();

        if (traders.length === 0) {
          console.log("  Active positions: none");
          continue;
        }

        console.log("  Active positions:", traders.length);

        for (let i = 0; i < traders.length; i++) {
          const trader = traders[i];
          const pos = await market.getPosition(trader);

          // Support both struct-return (named) and tuple-return (indexed)
          const isLong = pos.isLong ?? pos[1];
          const quantity = pos.quantity ?? pos[2];
          const collateral = pos.collateral ?? pos[3];
          const leverage = pos.leverage ?? pos[4];
          const marginMode = pos.marginMode ?? pos[5];
          const entryType = pos.entryType ?? pos[6];
          const limitPrice = pos.limitPrice ?? pos[7];
          const stopPrice = pos.stopPrice ?? pos[8];
          const collateralAsset =
            pos.collateralAsset ?? pos[9];
          const settlementAsset =
            pos.settlementAsset ?? pos[10];
          const isActive = pos.isActive ?? pos[11];
          const isClaimed = pos.isClaimed ?? pos[12];

          console.log(`\n  -- Position #${i + 1} --`);
          console.log("  Trader:", trader);
          console.log(
            "    Direction:",
            isLong ? "📈 LONG" : "📉 SHORT"
          );
          console.log(
            "    Quantity:",
            quantity.toString()
          );
          console.log(
            "    Collateral:",
            formatEther(collateral),
            "FLR"
          );
          console.log(
            "    Leverage:",
            leverage.toString(),
            "x"
          );
          console.log(
            "    Margin Mode:",
            marginMode === 0 ? "ISOLATED" : "CROSS"
          );

          const entryTypes = ["MARKET", "LIMIT", "STOP"];
          console.log(
            "    Entry Type:",
            entryTypes[Number(entryType)] ||
              entryType.toString()
          );

          if (entryType === 1n || entryType === 1) {
            console.log(
              "    Limit Price:",
              limitPrice.toString(),
              "gwei"
            );
          }
          if (entryType === 2n || entryType === 2) {
            console.log(
              "    Stop Price:",
              stopPrice.toString(),
              "gwei"
            );
          }

          console.log(
            "    Collateral Asset:",
            collateralAsset
          );
          console.log(
            "    Settlement Asset:",
            settlementAsset
          );
          console.log("    Active:", isActive);
          console.log("    Claimed:", isClaimed);
        }
      } catch (err) {
        console.log(
          "  (Could not fetch positions for this market:",
          err.message,
          ")"
        );
      }
    }
  }

  await printMarkets(
    "Active markets (not expired, not settled)",
    active
  );
  await printMarkets(
    "Expired but not settled markets",
    expiredNotSettled
  );
  await printMarkets("Settled markets", settled);
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });