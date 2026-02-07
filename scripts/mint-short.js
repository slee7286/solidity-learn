// scripts/mint-short.js
const hre = require("hardhat");

async function main() {
  // Get contract address from env or CLI
  const contractAddress =
    process.env.CONTRACT_ADDRESS || process.argv[2];

  if (!contractAddress) {
    console.error("❌ Please provide contract address:");
    console.error(
      "   CONTRACT_ADDRESS=0x... npx hardhat run scripts/mint-short.js --network coston2"
    );
    process.exit(1);
  }

  console.log("🔗 Contract:", contractAddress);
  const futures = await hre.ethers.getContractAt(
    "GasCapFutures",
    contractAddress
  );

  const [signer] = await hre.ethers.getSigners();
  console.log("👤 Trader:", signer.address);

  const c = futures.connect(signer);

  // 🔐 Ensure user is registered (simple "login" model)
  const username = process.env.USERNAME || "gas-short-trader";
  try {
    const profile = await c.getUserProfile(signer.address);
    const isRegistered = profile[0];

    if (!isRegistered) {
      console.log("📝 User not registered, registering as:", username);
      const txReg = await c.registerUser(username, "");
      await txReg.wait();
      console.log("✅ User registered");
    } else {
      console.log("✅ User already registered, calling login()");
      const txLogin = await c.login();
      await txLogin.wait();
      console.log("✅ Login recorded on-chain");
    }
  } catch (error) {
    console.error("❌ Failed to check/register user:", error.message);
    return;
  }

  // Get user balance
  const balance = await hre.ethers.provider.getBalance(
    signer.address
  );
  console.log("💰 Balance:", hre.ethers.formatEther(balance), "C2FLR");

  // Parameters (with env overrides)
  const quantity = parseInt(process.env.QUANTITY || "10", 10);
  const collateralStr = process.env.COLLATERAL || "1"; // in FLR
  const leverage = parseInt(process.env.LEVERAGE || "2", 10);
  const marginMode = parseInt(process.env.MARGIN_MODE || "0", 10); // 0 = ISOLATED, 1 = CROSS
  const collateralAmount = hre.ethers.parseEther(collateralStr);

  console.log("\n📉 Opening SHORT Position:");
  console.log("   Quantity:", quantity, "contracts");
  console.log("   Leverage:", leverage, "x");
  console.log(
    "   Margin Mode:",
    marginMode === 0 ? "ISOLATED" : "CROSS"
  );
  console.log("   Collateral:", collateralStr, "FLR");

  // Market info
  const [currentPrice, priceTs] = await c.getCurrentGasPrice();
  const state = await c.getContractState();
  const strikePrice = state[0];
  const expiryTimestamp = Number(state[1]);
  const isSettled = state[2];

  console.log("\n💹 Market Info:");
  console.log("   Current Price:", currentPrice.toString(), "gwei");
  console.log("   Strike Price:", strikePrice.toString(), "gwei");

  if (currentPrice < strikePrice) {
    console.log("   Status: 📉 Below strike (Short currently profitable)");
  } else {
    console.log("   Status: 📈 Above strike (Long currently profitable)");
  }

  console.log(
    "\n⚠️  You are betting that gas price will be BELOW",
    strikePrice.toString(),
    "gwei at expiry"
  );
  console.log(
    "   Expiry:",
    new Date(expiryTimestamp * 1000).toLocaleString()
  );
  console.log(
    "   Price Timestamp:",
    new Date(Number(priceTs) * 1000).toLocaleString()
  );

  // Check contract not expired/settled
  const now = Math.floor(Date.now() / 1000);
  if (expiryTimestamp <= now) {
    console.error("❌ Contract has expired!");
    return;
  }
  if (isSettled) {
    console.error("❌ Contract is already settled!");
    return;
  }

  // Check existing position (only one per trader in this contract)
  const existingPosition = await c.getPosition(signer.address);
  const exists = existingPosition.exists || existingPosition[0];
  const existingQuantity =
    existingPosition.quantity || existingPosition[2];

  if (exists && existingQuantity > 0n) {
    console.error("❌ You already have a position!");
    const isLong =
      existingPosition.isLong || existingPosition[1];
    console.log("   Direction:", isLong ? "LONG" : "SHORT");
    console.log("   Quantity:", existingQuantity.toString());
    return;
  }

  // Gas estimation and balance checks
  console.log("\n⛽ Estimating gas...");
  const gasEstimate = await c.mintShort.estimateGas(
    quantity,
    leverage,
    marginMode,
    { value: collateralAmount }
  );
  console.log("Gas estimate:", gasEstimate.toString());

  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || 0n;
  const gasCost = gasEstimate * gasPrice;
  const totalCost = collateralAmount + gasCost;

  if (balance < totalCost) {
    console.error("❌ Insufficient balance!");
    console.log(
      "   Required:",
      hre.ethers.formatEther(totalCost),
      "C2FLR"
    );
    console.log(
      "   Available:",
      hre.ethers.formatEther(balance),
      "C2FLR"
    );
    console.log(
      "   Shortfall:",
      hre.ethers.formatEther(totalCost - balance),
      "C2FLR"
    );
    return;
  }

  // Submit transaction
  console.log("\n⏳ Submitting transaction...");
  const tx = await c.mintShort(
    quantity,
    leverage,
    marginMode,
    {
      value: collateralAmount,
      gasLimit: (gasEstimate * 120n) / 100n // +20% buffer
    }
  );

  console.log("📝 Transaction submitted:", tx.hash);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

  // Show updated position
  console.log("\n📊 Your Position:");
  const position = await c.getPosition(signer.address);
  const posQuantity = position.quantity || position[2];
  const posCollateral = position.collateral || position[3];
  const posLeverage = position.leverage || position[4];

  console.log("   Direction: 📉 SHORT");
  console.log("   Quantity:", posQuantity.toString(), "contracts");
  console.log(
    "   Collateral:",
    hre.ethers.formatEther(posCollateral),
    "FLR"
  );
  console.log("   Leverage:", posLeverage.toString(), "x");

  console.log("\n🔗 View on Explorer:");
  console.log("   https://coston2-explorer.flare.network/tx/" + tx.hash);

  console.log("\n✅ Position opened successfully!");
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });