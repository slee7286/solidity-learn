// scripts/create-market.js
const hre = require("hardhat");

async function main() {
  const factoryAddress =
    process.env.FACTORY_ADDRESS || process.argv[2];

  if (!factoryAddress) {
    console.error("❌ Please provide factory address:");
    console.error(
      "   FACTORY_ADDRESS=0x... npx hardhat run scripts/create-market.js --network coston2"
    );
    process.exit(1);
  }

  const factory = await hre.ethers.getContractAt(
    "GasCapFuturesFactory",
    factoryAddress
  );

  // ---- Editable config (or use env vars) ----
  const strikePrice = Number(process.env.STRIKE_PRICE || 25); // gwei
  const expiryDays = Number(process.env.EXPIRY_DAYS || 7); // days
  const expiryDuration = expiryDays * 24 * 60 * 60; // seconds

  const marketName =
    process.env.MARKET_NAME || "Gas Futures v1";
  const marketDescription =
    process.env.MARKET_DESCRIPTION ||
    "Coston2 gas price futures using FTSO";

  console.log("Factory:", factoryAddress);
  console.log("Strike Price:", strikePrice, "gwei");
  console.log("Expiry (days):", expiryDays);
  console.log("Name:", marketName);
  console.log("Description:", marketDescription);

  const tx = await factory.createMarket(
    strikePrice,
    expiryDuration,
    marketName,
    marketDescription
  );

  console.log("⏳ Creating market, tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Market creation tx confirmed, block:", receipt.blockNumber);

  const marketsCount = await factory.marketsCount();
  const lastIndex = marketsCount - 1n;

  const marketInfo = await factory.getMarket(lastIndex);
  const marketAddress = marketInfo[0];

  console.log("\n🎯 New market created:");
  console.log("   Index:", lastIndex.toString());
  console.log("   Address:", marketAddress);
  console.log(
    "   Explorer:",
    `https://coston2-explorer.flare.network/address/${marketAddress}`
  );
  console.log("\n💡 Use this as CONTRACT_ADDRESS for other scripts.");
}

main().catch(console.error);