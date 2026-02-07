// test/GasCapFutures.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("GasCapFutures", function () {
  let futures;
  let owner, trader1, trader2, liquidityProvider;

  const STRIKE_PRICE = 50; // 50 gwei
  const EXPIRY_DURATION = 7 * 24 * 60 * 60; // 7 days

  beforeEach(async function () {
    [owner, trader1, trader2, liquidityProvider] =
      await ethers.getSigners();

    const GasCapFutures = await ethers.getContractFactory(
      "GasCapFutures"
    );
    futures = await GasCapFutures.deploy(
      STRIKE_PRICE,
      EXPIRY_DURATION,
      "Test Market",
      "Unit test gas futures"
    );
    await futures.waitForDeployment();
  });

  describe("Deployment", function () {
    it("sets correct strike and expiry", async function () {
      expect(await futures.strikePrice()).to.equal(STRIKE_PRICE);
      const expiryTimestamp = await futures.expiryTimestamp();
      const currentTime = await time.latest();
      expect(expiryTimestamp).to.be.closeTo(
        currentTime + EXPIRY_DURATION,
        5
      );
      expect(await futures.isSettled()).to.equal(false);
    });

    it("exposes market info", async function () {
      const info = await futures.getMarketInfo();
      expect(info[0]).to.equal(await owner.getAddress()); // creator
      expect(info[1]).to.equal("Test Market");
      expect(info[2]).to.equal("Unit test gas futures");
      expect(info[3]).to.equal(STRIKE_PRICE);
    });
  });

  async function registerUser(signer, username = "user") {
    const c = futures.connect(signer);
    const profile = await c.getUserProfile(await signer.getAddress());
    if (!profile[0]) {
      const tx = await c.registerUser(username, "");
      await tx.wait();
    }
  }

  describe("Minting positions", function () {
    it("allows minting long positions", async function () {
      await registerUser(trader1, "longUser");
      const quantity = 10;
      const collateral = ethers.parseEther("1");
      const leverage = 2;
      const marginMode = 0; // ISOLATED

      await expect(
        futures.connect(trader1).mintLong(quantity, leverage, marginMode, {
            value: collateral
          })
      ).to.emit(futures, "FuturesMinted").withArgs(
          trader1.address,
          true,
          quantity,
          collateral,
          leverage,
          0, // MarginMode.ISOLATED
          0, // EntryType.MARKET
          0,
          0,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        );

      const pos = await futures.getPosition(trader1.address);
      expect(pos[0]).to.equal(true); // exists
      expect(pos[1]).to.equal(true); // isLong
      expect(pos[2]).to.equal(quantity); // quantity
      expect(pos[3]).to.equal(collateral); // collateral
      expect(pos[4]).to.equal(leverage); // leverage
    });

    it("allows minting short positions", async function () {
      await registerUser(trader2, "shortUser");
      const quantity = 5;
      const collateral = ethers.parseEther("0.5");
      const leverage = 3;
      const marginMode = 1; // CROSS

      await futures.connect(trader2).mintShort(quantity, leverage, marginMode, {
          value: collateral
        });

      const pos = await futures.getPosition(trader2.address);
      expect(pos[0]).to.equal(true);
      expect(pos[1]).to.equal(false); // isLong
      expect(pos[2]).to.equal(quantity);
      expect(pos[3]).to.equal(collateral);
      expect(pos[4]).to.equal(leverage);
      expect(pos[5]).to.equal(1); // MarginMode.CROSS
    });

    it("reverts when minting with zero quantity", async function () {
      await registerUser(trader1);
      await expect(
        futures.connect(trader1).mintLong(0, 1, 0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Quantity must be positive");
    });

    it("reverts when minting without collateral", async function () {
      await registerUser(trader1);
      await expect(
        futures.connect(trader1).mintLong(10, 1, 0, { value: 0 })
      ).to.be.revertedWith("Must provide collateral");
    });

    it("reverts if user not registered", async function () {
      // note: onlyRegistered is enforced at _openPosition
      await expect(
        futures.connect(trader1).mintLong(10, 1, 0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("User not registered");
    });

    it("reverts after expiry", async function () {
      await registerUser(trader1);
      await time.increase(EXPIRY_DURATION + 1);

      await expect(
        futures.connect(trader1).mintLong(10, 1, 0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Contract expired");
    });
  });

  describe("Liquidity management", function () {
    it("allows adding liquidity", async function () {
      const liquidity = ethers.parseEther("5");

      await expect(
        futures.connect(liquidityProvider).addLiquidity({ value: liquidity })
      ).to.emit(futures, "LiquidityAdded").withArgs(liquidityProvider.address, liquidity);

      expect(await futures.totalLiquidity()).to.equal(liquidity);
      expect(
        await futures.liquidityProvided(liquidityProvider.address)
      ).to.equal(liquidity);
    });

    it("allows removing liquidity before settlement", async function () {
      const liquidity = ethers.parseEther("5");
      const remove = ethers.parseEther("2");
      await futures.connect(liquidityProvider).addLiquidity({ value: liquidity });

      await expect(
        futures.connect(liquidityProvider).removeLiquidity(remove)
      ).to.emit(futures, "LiquidityRemoved").withArgs(liquidityProvider.address, remove);

      expect(await futures.totalLiquidity()).to.equal(
        liquidity - remove
      );
    });

    it("reverts when removing more than provided", async function () {
      const liquidity = ethers.parseEther("5");
      await futures.connect(liquidityProvider).addLiquidity({ value: liquidity });

      await expect(
        futures.connect(liquidityProvider).removeLiquidity(ethers.parseEther("10"))
      ).to.be.revertedWith("Insufficient provided liquidity");
    });
  });

  describe("Settlement & payouts", function () {
    beforeEach(async function () {
      await registerUser(trader1, "longUser");
      await registerUser(trader2, "shortUser");

      // Long & short same quantity for simple tests
      await futures.connect(trader1).mintLong(10, 1, 0, { value: ethers.parseEther("1") });
      await futures.connect(trader2).mintShort(10, 1, 0, { value: ethers.parseEther("1") });

      await futures.connect(liquidityProvider).addLiquidity({ value: ethers.parseEther("10") });
    });

    it("reverts settlement before expiry", async function () {
      await expect(futures.settleContract()).to.be.revertedWith(
        "Not yet expired"
      );
    });

    it("settles contract after expiry", async function () {
      await time.increase(EXPIRY_DURATION + 1);

      await expect(futures.settleContract()).to.emit(
        futures,
        "ContractSettled"
      );

      expect(await futures.isSettled()).to.equal(true);
    });

    it("allows claiming payouts after settlement", async function () {
      await time.increase(EXPIRY_DURATION + 1);
      await futures.settleContract();

      const posBefore = await futures.getPosition(trader1.address);
      expect(posBefore[12]).to.equal(false); // isClaimed

      await expect(
        futures.connect(trader1).claimPayout()
      ).to.emit(futures, "PayoutClaimed");

      const posAfter = await futures.getPosition(trader1.address);
      expect(posAfter[12]).to.equal(true);
    });

    it("reverts double claiming", async function () {
      await time.increase(EXPIRY_DURATION + 1);
      await futures.settleContract();

      await futures.connect(trader1).claimPayout();

      await expect(
        futures.connect(trader1).claimPayout()
      ).to.be.revertedWith("Already claimed");
    });
  });

  describe("View functions", function () {
    it("returns contract state correctly", async function () {
      const state = await futures.getContractState();
      expect(state[0]).to.equal(STRIKE_PRICE); // strike
      expect(state[2]).to.equal(false); // isSettled
      expect(state[4]).to.equal(0); // totalLiquidity
    });

    it("returns gas price without reverting", async function () {
      const [price, ts] = await futures.getCurrentGasPrice();
      expect(price).to.be.gt(0);
      expect(ts).to.be.gt(0);
    });

    it("tracks open positions list", async function () {
      await registerUser(trader1);
      await futures.connect(trader1).mintLong(5, 1, 0, { value: ethers.parseEther("1") });

      const res = await futures.getAllOpenPositions();
      const traders = res[0];
      const positions = res[1];

      expect(traders.length).to.equal(1);
      expect(traders[0]).to.equal(trader1.address);
      expect(positions[0].quantity).to.equal(5);
    });
  });
});