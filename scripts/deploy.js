const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying GasCapFutures to:", hre.network.name);

  const GasCapFutures = await hre.ethers.getContractFactory("GasCapFutures");

  const strikePrice = 25; // 25 gwei
  const expiryDuration = 7 * 24 * 60 * 60; // 1 week
  const marketName = "Gas Futures v1";
  const marketDescription = "Coston2 gas price futures using FTSO";

  console.log("Strike Price:", strikePrice, "gwei");
  console.log("Expiry Duration:", expiryDuration / 86400, "days");
  console.log("Market Name:", marketName);
  console.log("Market Description:", marketDescription);

  // 👇 constructor now takes 4 arguments
  const futures = await GasCapFutures.deploy(
    strikePrice,
    expiryDuration,
    marketName,
    marketDescription
  );
  await futures.waitForDeployment();

  const address = await futures.getAddress();
  console.log("✅ Contract deployed to:", address);

  // Test the gas price function
  try {
    const [price, timestamp] = await futures.getCurrentGasPrice();
    console.log("✅ Gas price function working!");
    console.log("   Price:", hre.ethers.formatUnits(price, "gwei"), "gwei");
    console.log(
      "   Timestamp:",
      new Date(Number(timestamp) * 1000).toLocaleString()
    );
  } catch (error) {
    console.error("❌ Gas price function failed:", error.message);
  }

  console.log(
    "\n🔗 Explorer:",
    `https://coston2-explorer.flare.network/address/${address}`
  );
  console.log("\n💡 Use this address:");
  console.log(`export CONTRACT_ADDRESS=${address}`);

  // Test contract state
  const state = await futures.getContractState();
  // getContractState returns a tuple, not named fields
  console.log("\n📊 Contract State:");
  console.log("   Strike Price:", state[0].toString(), "gwei");
  console.log(
    "   Expiry:",
    new Date(Number(state[1]) * 1000).toLocaleString()
  );

  // Optional: show market info using new helper
  const marketInfo = await futures.getMarketInfo();
  console.log("\n📈 Market Info:");
  console.log("   Creator:", marketInfo[0]);
  console.log("   Name:", marketInfo[1]);
  console.log("   Description:", marketInfo[2]);
}

main().catch(console.error);