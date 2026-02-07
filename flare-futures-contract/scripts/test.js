// test/GasCapFutures.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("GasCapFutures", function () {
    let futures;
    let ftsoRegistryMock;
    let owner, trader1, trader2, liquidityProvider;
    
    const STRIKE_PRICE = 50; // 50 gwei
    const EXPIRY_DURATION = 7 * 24 * 60 * 60; // 7 days
    
    beforeEach(async function () {
        [owner, trader1, trader2, liquidityProvider] = await ethers.getSigners();
        
        // Deploy mock FTSO Registry
        const FTSORegistryMock = await ethers.getContractFactory("FTSORegistryMock");
        ftsoRegistryMock = await FTSORegistryMock.deploy();
        await ftsoRegistryMock.deployed();
        
        // Deploy GasCapFutures
        const GasCapFutures = await ethers.getContractFactory("GasCapFutures");
        futures = await GasCapFutures.deploy(
            ftsoRegistryMock.address,
            STRIKE_PRICE,
            EXPIRY_DURATION
        );
        await futures.deployed();
    });
    
    describe("Deployment", function () {
        it("Should set the correct strike price", async function () {
            expect(await futures.strikePrice()).to.equal(STRIKE_PRICE);
        });
        
        it("Should set the correct expiry timestamp", async function () {
            const expiryTimestamp = await futures.expiryTimestamp();
            const currentTime = await time.latest();
            expect(expiryTimestamp).to.be.closeTo(
                currentTime + EXPIRY_DURATION,
                5 // 5 second tolerance
            );
        });
        
        it("Should not be settled initially", async function () {
            expect(await futures.isSettled()).to.equal(false);
        });
    });
    
    describe("Minting Futures", function () {
        it("Should allow minting long positions", async function () {
            const quantity = 10;
            const collateral = ethers.utils.parseEther("1");
            
            await expect(
                futures.connect(trader1).mintFuture(true, quantity, { value: collateral })
            )
                .to.emit(futures, "FuturesMinted")
                .withArgs(trader1.address, true, quantity, collateral);
            
            const position = await futures.getPosition(trader1.address);
            expect(position.isLong).to.equal(true);
            expect(position.quantity).to.equal(quantity);
            expect(position.collateral).to.equal(collateral);
        });
        
        it("Should allow minting short positions", async function () {
            const quantity = 5;
            const collateral = ethers.utils.parseEther("0.5");
            
            await futures.connect(trader2).mintFuture(false, quantity, { value: collateral });
            
            const position = await futures.getPosition(trader2.address);
            expect(position.isLong).to.equal(false);
            expect(position.quantity).to.equal(quantity);
        });
        
        it("Should allow adding to existing positions", async function () {
            await futures.connect(trader1).mintFuture(true, 5, { value: ethers.utils.parseEther("1") });
            await futures.connect(trader1).mintFuture(true, 3, { value: ethers.utils.parseEther("0.5") });
            
            const position = await futures.getPosition(trader1.address);
            expect(position.quantity).to.equal(8);
            expect(position.collateral).to.equal(ethers.utils.parseEther("1.5"));
        });
        
        it("Should revert when minting with zero quantity", async function () {
            await expect(
                futures.connect(trader1).mintFuture(true, 0, { value: ethers.utils.parseEther("1") })
            ).to.be.revertedWith("Quantity must be positive");
        });
        
        it("Should revert when minting without collateral", async function () {
            await expect(
                futures.connect(trader1).mintFuture(true, 10, { value: 0 })
            ).to.be.revertedWith("Must provide collateral");
        });
        
        it("Should revert when mixing long and short positions", async function () {
            await futures.connect(trader1).mintFuture(true, 5, { value: ethers.utils.parseEther("1") });
            
            await expect(
                futures.connect(trader1).mintFuture(false, 5, { value: ethers.utils.parseEther("1") })
            ).to.be.revertedWith("Cannot mix long/short");
        });
        
        it("Should revert after expiry", async function () {
            await time.increase(EXPIRY_DURATION + 1);
            
            await expect(
                futures.connect(trader1).mintFuture(true, 10, { value: ethers.utils.parseEther("1") })
            ).to.be.revertedWith("Contract expired");
        });
    });
    
    describe("Liquidity Management", function () {
        it("Should allow adding liquidity", async function () {
            const liquidityAmount = ethers.utils.parseEther("5");
            
            await expect(
                futures.connect(liquidityProvider).addLiquidity({ value: liquidityAmount })
            )
                .to.emit(futures, "LiquidityAdded")
                .withArgs(liquidityProvider.address, liquidityAmount);
            
            expect(await futures.totalLiquidity()).to.equal(liquidityAmount);
            expect(await futures.liquidityProvided(liquidityProvider.address)).to.equal(liquidityAmount);
        });
        
        it("Should allow removing liquidity before settlement", async function () {
            const liquidityAmount = ethers.utils.parseEther("5");
            const removeAmount = ethers.utils.parseEther("2");
            
            await futures.connect(liquidityProvider).addLiquidity({ value: liquidityAmount });
            
            const initialBalance = await ethers.provider.getBalance(liquidityProvider.address);
            
            await expect(
                futures.connect(liquidityProvider).removeLiquidity(removeAmount)
            )
                .to.emit(futures, "LiquidityRemoved")
                .withArgs(liquidityProvider.address, removeAmount);
            
            expect(await futures.totalLiquidity()).to.equal(liquidityAmount.sub(removeAmount));
        });
        
        it("Should revert when removing more than provided", async function () {
            const liquidityAmount = ethers.utils.parseEther("5");
            
            await futures.connect(liquidityProvider).addLiquidity({ value: liquidityAmount });
            
            await expect(
                futures.connect(liquidityProvider).removeLiquidity(ethers.utils.parseEther("10"))
            ).to.be.revertedWith("Insufficient liquidity");
        });
    });
    
    describe("Settlement", function () {
        beforeEach(async function () {
            // Mint some positions
            await futures.connect(trader1).mintFuture(true, 10, { value: ethers.utils.parseEther("1") });
            await futures.connect(trader2).mintFuture(false, 10, { value: ethers.utils.parseEther("1") });
            
            // Add liquidity
            await futures.connect(liquidityProvider).addLiquidity({ value: ethers.utils.parseEther("10") });
        });
        
        it("Should settle contract after expiry", async function () {
            // Fast forward past expiry
            await time.increase(EXPIRY_DURATION + 1);
            
            // Set mock FTSO price to 60 gwei
            const settlementPrice = 60;
            await ftsoRegistryMock.setPrice(settlementPrice, await time.latest());
            
            await expect(futures.settleContract())
                .to.emit(futures, "ContractSettled");
            
            expect(await futures.isSettled()).to.equal(true);
        });
        
        it("Should revert settlement before expiry", async function () {
            await expect(futures.settleContract()).to.be.revertedWith("Not yet expired");
        });
        
        it("Should calculate correct payouts for long position when price rises", async function () {
            await time.increase(EXPIRY_DURATION + 1);
            
            // Settlement price = 60 gwei (higher than 50 strike)
            await ftsoRegistryMock.setPrice(60, await time.latest());
            await futures.settleContract();
            
            const payout = await futures.calculatePayout(trader1.address);
            // Long position: (60 - 50) * 10 quantity = 100 gwei profit
            // Plus original collateral
            expect(payout).to.be.gt(ethers.utils.parseEther("1"));
        });
        
        it("Should calculate correct payouts for short position when price falls", async function () {
            await time.increase(EXPIRY_DURATION + 1);
            
            // Settlement price = 40 gwei (lower than 50 strike)
            await ftsoRegistryMock.setPrice(40, await time.latest());
            await futures.settleContract();
            
            const payout = await futures.calculatePayout(trader2.address);
            // Short position: (50 - 40) * 10 quantity = 100 gwei profit
            // Plus original collateral
            expect(payout).to.be.gt(ethers.utils.parseEther("1"));
        });
        
        it("Should allow claiming payouts after settlement", async function () {
            await time.increase(EXPIRY_DURATION + 1);
            await ftsoRegistryMock.setPrice(60, await time.latest());
            await futures.settleContract();
            
            const initialBalance = await ethers.provider.getBalance(trader1.address);
            
            await expect(futures.connect(trader1).claimPayout())
                .to.emit(futures, "PayoutClaimed");
            
            const position = await futures.getPosition(trader1.address);
            expect(position.isClaimed).to.equal(true);
        });
        
        it("Should revert double claiming", async function () {
            await time.increase(EXPIRY_DURATION + 1);
            await ftsoRegistryMock.setPrice(60, await time.latest());
            await futures.settleContract();
            
            await futures.connect(trader1).claimPayout();
            
            await expect(
                futures.connect(trader1).claimPayout()
            ).to.be.revertedWith("Already claimed");
        });
    });
    
    describe("View Functions", function () {
        it("Should return contract state correctly", async function () {
            const state = await futures.getContractState();
            
            expect(state._strikePrice).to.equal(STRIKE_PRICE);
            expect(state._isSettled).to.equal(false);
            expect(state._totalLiquidity).to.equal(0);
        });
        
        it("Should return current gas price from FTSO", async function () {
            const currentPrice = 55;
            await ftsoRegistryMock.setPrice(currentPrice, await time.latest());
            
            const [price, timestamp] = await futures.getCurrentGasPrice();
            expect(price).to.equal(currentPrice);
        });
    });
});

// Mock FTSO Registry for testing
// File: contracts/mocks/FTSORegistryMock.sol
/*
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract FTSORegistryMock {
    uint256 private price;
    uint256 private timestamp;
    uint256 private constant DECIMALS = 5;
    
    function setPrice(uint256 _price, uint256 _timestamp) external {
        price = _price;
        timestamp = _timestamp;
    }
    
    function getCurrentPriceWithDecimals(string memory) 
        external 
        view 
        returns (uint256, uint256, uint256) 
    {
        return (price, timestamp, DECIMALS);
    }
    
    function getCurrentPrice(string memory) 
        external 
        view 
        returns (uint256, uint256) 
    {
        return (price, timestamp);
    }
}
*/
