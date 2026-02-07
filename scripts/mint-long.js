// scripts/mint-long.js
const hre = require("hardhat");

async function main() {
  const contractAddress =
    process.env.CONTRACT_ADDRESS || process.argv[2];

  if (!contractAddress) {
    console.error("❌ Please provide contract address:");
    console.error(
      "   CONTRACT_ADDRESS=0x... npx hardhat run scripts/mint-long.js --network coston2"
    );
    process.exit(1);
  }

  console.log("🔗 Contract:", contractAddress);

  const [signer] = await hre.ethers.getSigners();
  console.log("👤 Trader:", signer.address);

  const balance = await hre.ethers.provider.getBalance(
    signer.address
  );
  console.log(
    "💰 Balance:",
    hre.ethers.formatEther(balance),
    "C2FLR"
  );

  const futures = await hre.ethers.getContractAt(
    "GasCapFutures",
    contractAddress
  );
  const c = futures.connect(signer); // 👈 use this for all state-changing calls

  // 🔐 Ensure user is registered
  const username = process.env.USERNAME || "gas-trader";
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

  // Check contract state
  console.log("\n🔍 Checking contract state...");
  let state;
  try {
    state = await c.getContractState();
    const strikePrice = state[0];
    const expiryTimestamp = Number(state[1]);
    const isSettled = state[2];

    console.log("Strike Price:", strikePrice.toString(), "gwei");
    console.log(
      "Expiry:",
      new Date(expiryTimestamp * 1000).toLocaleString()
    );
    console.log("Is Settled:", isSettled);

    const now = Math.floor(Date.now() / 1000);
    if (expiryTimestamp <= now) {
      console.error("❌ Contract has expired!");
      return;
    }

    if (isSettled) {
      console.error("❌ Contract is already settled!");
      return;
    }
  } catch (error) {
    console.error("❌ Failed to get contract state:", error.message);
    return;
  }

  // Current gas price
  try {
    const [currentPrice, timestamp] = await c.getCurrentGasPrice();
    console.log("Current Gas Price:", currentPrice.toString(), "gwei");
    console.log(
      "Price Timestamp:",
      new Date(Number(timestamp) * 1000).toLocaleString()
    );
  } catch (error) {
    console.error("❌ Failed to get current gas price:", error.message);
    return;
  }

  // === Parameters from env ===
  const quantity = parseInt(process.env.QUANTITY || "10", 10);
  const leverage = parseInt(process.env.LEVERAGE || "2", 10);
  const marginMode = parseInt(process.env.MARGIN_MODE || "0", 10); // 0=ISOLATED, 1=CROSS
  const collateralStr = process.env.COLLATERAL || "1";
  const collateralAmount = hre.ethers.parseEther(collateralStr);

  console.log("\n📈 Opening LONG Position:");
  console.log("   Quantity:", quantity, "contracts");
  console.log("   Leverage:", leverage, "x");
  console.log(
    "   Margin Mode:",
    marginMode === 0 ? "ISOLATED" : "CROSS"
  );
  console.log("   Collateral:", collateralStr, "FLR");

  try {
    // Check existing position
    const existingPosition = await c.getPosition(signer.address);
    const exists = existingPosition.exists || existingPosition[0];
    const existingQuantity =
      existingPosition.quantity || existingPosition[2];

    if (exists && existingQuantity > 0n) {
      console.error("❌ You already have a position!");
      console.log(
        "   Direction:",
        (existingPosition.isLong || existingPosition[1])
          ? "LONG"
          : "SHORT"
      );
      console.log("   Quantity:", existingQuantity.toString());
      return;
    }

    // Gas estimate
    console.log("\n⛽ Estimating gas...");
    const gasEstimate = await c.mintLong.estimateGas(
      quantity,
      leverage,
      marginMode,
      {
        value: collateralAmount
      }
    );
    console.log("Gas estimate:", gasEstimate.toString());

    // Balance check
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

    // Execute tx
    console.log("\n🚀 Executing transaction...");
    const tx = await c.mintLong(quantity, leverage, marginMode, {
      value: collateralAmount,
      gasLimit: (gasEstimate * 120n) / 100n
    });

    console.log("📝 Transaction hash:", tx.hash);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
    console.log("   Block:", receipt.blockNumber);
    console.log("   Gas used:", receipt.gasUsed.toString());

    // Check new position
    const newPosition = await c.getPosition(signer.address);
    console.log("\n🎉 Position created:");
    console.log("   Direction: 📈 LONG");
    console.log(
      "   Quantity:",
      (newPosition.quantity || newPosition[2]).toString(),
      "contracts"
    );
    console.log(
      "   Collateral:",
      hre.ethers.formatEther(
        newPosition.collateral || newPosition[3]
      ),
      "FLR"
    );
    console.log(
      "   Leverage:",
      (newPosition.leverage || newPosition[4]).toString(),
      "x"
    );
  } catch (error) {
    console.error("\n❌ Transaction failed:");
    console.error("Error:", error.message);

    if (error.data) {
      console.log("Error data:", error.data);
    }

    console.log("\n💡 Possible causes:");
    console.log("   1. Contract validation failed (check require statements)");
    console.log("   2. Insufficient collateral amount");
    console.log("   3. Invalid quantity or leverage (must be > 0)");
    console.log("   4. User not registered (registration may have failed)");
    console.log("   5. Contract expired or already settled");
    console.log("   6. Gas limit too low");

    if (error.reason) {
      console.log("   Revert reason:", error.reason);
    }
  }
}

main().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });