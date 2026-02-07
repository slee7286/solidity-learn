// scripts/list-markets.js
const hre = require("hardhat");

async function main() {
  const factoryAddress =
    process.env.FACTORY_ADDRESS || process.argv[2];

  if (!factoryAddress) {
    console.error("❌ Please provide factory address:");
    console.error(
      "   FACTORY_ADDRESS=0x... npx hardhat run scripts/list-markets.js --network coston2"
    );
    process.exit(1);
  }

  const factory = await hre.ethers.getContractAt(
    "GasCapFuturesFactory",
    factoryAddress
  );

  const count = await factory.marketsCount();
  console.log("📊 Total markets:", count.toString());

  if (count === 0n) {
    console.log("No markets yet.");
    return;
  }

  for (let i = 0n; i < count; i++) {
    const [marketAddr, creator, createdAt] =
      await factory.getMarket(i);
    const market = await hre.ethers.getContractAt(
      "GasCapFutures",
      marketAddr
    );
    const info = await market.getMarketInfo();
    // info: [creator, name, description, strike, expiry, isSettled, settlementPrice]

    console.log(`\n#${i.toString()} Market: ${marketAddr}`);
    console.log("  Creator:", creator);
    console.log("  Name:", info[1]);
    console.log("  Description:", info[2]);
    console.log("  Strike:", info[3].toString(), "gwei");
    console.log(
      "  Expiry:",
      new Date(Number(info[4]) * 1000).toLocaleString()
    );
    console.log("  Is Settled:", info[5]);
  }
}

main().catch(console.error);