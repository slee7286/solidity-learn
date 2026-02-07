// scripts/deploy-factory.js
const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying GasCapFuturesFactory to:", hre.network.name);

  const Factory = await hre.ethers.getContractFactory(
    "GasCapFuturesFactory"
  );
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const address = await factory.getAddress();
  console.log("✅ Factory deployed to:", address);

  console.log("\n💡 Use this address as FACTORY_ADDRESS:");
  console.log(`export FACTORY_ADDRESS=${address}`);
}

main().catch(console.error);