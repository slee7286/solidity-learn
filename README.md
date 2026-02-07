# GasCap Futures on Flare

A decentralized futures contract for gas prices that uses Flare's FTSO (Flare Time Series Oracle) for on-chain price feeds and automatic settlement.

## Overview

This smart contract implements cash-settled futures for gas prices with:
- **Strike Price**: Configurable (e.g., 50 gwei)
- **Oracle Integration**: FTSO data feed for automatic settlement
- **Position Types**: Long and Short positions
- **Liquidity Pool**: For settlement payouts
- **Auto-Settlement**: Triggered by anyone after expiry using FTSO price data

## Features

### 1. FTSO Oracle Integration
- Real-time gas price data from Flare Time Series Oracle
- Trustless price verification
- No external API dependencies

### 2. Futures Trading
- Mint long positions (profit when gas price > strike)
- Mint short positions (profit when gas price < strike)
- Collateralized positions for risk management

### 3. Liquidity Management
- Add/remove liquidity before settlement
- Liquidity providers earn from settlement fees (can be extended)
- Pool-based payout mechanism

### 4. Automatic Settlement
- Anyone can trigger settlement after expiry
- Uses latest FTSO price data
- Cash-settled based on price difference from strike

## Contract Architecture

```
GasCapFutures.sol
├── FTSO Integration
│   ├── getCurrentGasPrice() - Fetch current price
│   └── settleContract() - Auto-settle using FTSO
├── Position Management
│   ├── mintFuture() - Create long/short positions
│   ├── getPosition() - View position details
│   └── calculatePayout() - Calculate settlement payout
├── Liquidity Pool
│   ├── addLiquidity() - Add funds to pool
│   └── removeLiquidity() - Remove funds (before settlement)
└── Settlement & Payout
    ├── settleContract() - Trigger settlement
    └── claimPayout() - Claim settlement payout
```

## Setup & Installation

### Prerequisites
- Node.js v16+
- npm or yarn
- Hardhat or Foundry

### Installation

```bash
# Clone the repository
git clone <your-repo>
cd gascap-futures-flare

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

### Environment Variables

Create a `.env` file:
```bash
PRIVATE_KEY=your_private_key_here
FLARE_RPC_URL=https://flare-api.flare.network/ext/C/rpc
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
```

## Deployment

### Flare Network Addresses

**Coston2 Testnet (Recommended for Testing)**
- FTSO Registry: `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`
- Chain ID: 114
- RPC: https://coston2-api.flare.network/ext/C/rpc
- Explorer: https://coston2-explorer.flare.network
- Faucet: https://faucet.flare.network/coston2

**Flare Mainnet**
- FTSO Registry: `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`
- Chain ID: 14
- RPC: https://flare-api.flare.network/ext/C/rpc
- Explorer: https://flare-explorer.flare.network

### Deploy to Coston2 Testnet

```bash
# Compile contracts
npx hardhat compile

# Deploy to Coston2
npx hardhat run scripts/deploy.js --network coston2

# Example output:
# GasCapFutures deployed to: 0x123...
# Strike Price: 50 gwei
# Expiry Duration: 7 days
```

### Deploy to Local Network

```bash
# Start local Hardhat node
npx hardhat node

# Deploy (in another terminal)
npx hardhat run scripts/deploy.js --network localhost
```

### Using Foundry

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Build
forge build

# Deploy to Coston2
forge script script/Deploy.s.sol:DeployGasCapFutures \
  --rpc-url $COSTON2_RPC_URL \
  --broadcast \
  --verify

# Deploy to local anvil
anvil # start local node
forge script script/Deploy.s.sol:DeployGasCapFutures \
  --rpc-url http://localhost:8545 \
  --broadcast
```

## Testing

```bash
# Run all tests
npx hardhat test

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run specific test file
npx hardhat test test/GasCapFutures.test.js

# Using Foundry
forge test
forge test -vvv # verbose output
```

## Usage Examples

### 1. Mint a Long Position

```javascript
const futures = await ethers.getContractAt("GasCapFutures", contractAddress);

// Mint 10 contracts with 1 ETH collateral
// Profit if gas price > 50 gwei at settlement
await futures.mintFuture(
    true, // isLong = true
    10,   // quantity
    { value: ethers.utils.parseEther("1") }
);
```

### 2. Mint a Short Position

```javascript
// Mint 5 contracts with 0.5 ETH collateral
// Profit if gas price < 50 gwei at settlement
await futures.mintFuture(
    false, // isLong = false
    5,     // quantity
    { value: ethers.utils.parseEther("0.5") }
);
```

### 3. Add Liquidity

```javascript
// Add 10 FLR to liquidity pool
await futures.addLiquidity({ 
    value: ethers.utils.parseEther("10") 
});
```

### 4. Settle Contract (After Expiry)

```javascript
// Anyone can trigger settlement after expiry
await futures.settleContract();

// Contract fetches current gas price from FTSO
// and calculates payouts
```

### 5. Claim Payout

```javascript
// After settlement, claim your payout
await futures.claimPayout();

// Payout = collateral + P&L based on price difference
```

### 6. View Contract State

```javascript
// Get contract info
const state = await futures.getContractState();
console.log("Strike Price:", state._strikePrice.toString());
console.log("Is Settled:", state._isSettled);
console.log("Settlement Price:", state._settlementPrice.toString());

// Get your position
const position = await futures.getPosition(yourAddress);
console.log("Is Long:", position.isLong);
console.log("Quantity:", position.quantity.toString());
console.log("Collateral:", ethers.utils.formatEther(position.collateral));

// Get current gas price from FTSO
const [currentPrice, timestamp] = await futures.getCurrentGasPrice();
console.log("Current Gas Price:", currentPrice.toString(), "gwei");
```

## How It Works

### 1. Contract Creation
- Owner deploys contract with strike price (e.g., 50 gwei) and expiry duration
- FTSO Registry is configured for price feeds

### 2. Trading Phase (Before Expiry)
- Traders mint long or short positions with collateral
- Liquidity providers add funds to the pool
- Position: Long profits if settlement > strike, Short profits if settlement < strike

### 3. Settlement (After Expiry)
- Anyone calls `settleContract()` after expiry time
- Contract queries FTSO for current gas price
- Settlement price is recorded on-chain

### 4. Payout Calculation
```
For Long Position:
P&L = (Settlement Price - Strike Price) × Quantity
Payout = Collateral + P&L

For Short Position:
P&L = (Strike Price - Settlement Price) × Quantity
Payout = Collateral + P&L

Note: Minimum payout is 0 (max loss = collateral)
```

### 5. Claims
- Traders call `claimPayout()` to receive settlement
- Payouts are paid from contract balance (collateral + liquidity pool)

## Security Considerations

⚠️ **Important**: This is a demonstration contract. For production use:

1. **Audit Required**: Get professional security audit
2. **Oracle Risk**: Ensure FTSO data freshness and validity
3. **Collateral Management**: Implement margin calls and liquidations
4. **Settlement Risk**: Add multiple price sources or time-weighted averages
5. **Access Control**: Enhance admin functions and emergency stops
6. **Gas Limits**: Test with realistic gas prices and quantities

## Advanced Features (Extending the Contract)

### 1. Using FDC for Additional Data
```solidity
// Add FDC verification for settlement
interface IFdcVerification {
    function verifyAttestation(bytes calldata _data) external view returns (bool);
}

// In settlement function:
require(fdcVerification.verifyAttestation(attestationData), "Invalid attestation");
```

### 2. Multiple Settlement Sources
```solidity
// Query multiple FTSO price feeds
uint256 ethPrice = ftsoRegistry.getCurrentPrice("ETH");
uint256 btcPrice = ftsoRegistry.getCurrentPrice("BTC");
uint256 flrPrice = ftsoRegistry.getCurrentPrice("FLR");

// Calculate weighted average or use median
```

### 3. Margin Calls and Liquidations
```solidity
function checkMargin(address trader) public view returns (bool) {
    // Calculate unrealized P&L
    // Compare to collateral
    // Return true if margin is sufficient
}

function liquidate(address trader) external {
    require(!checkMargin(trader), "Margin sufficient");
    // Force close position at current price
}
```

## Troubleshooting

### Common Issues

1. **"Contract expired" error**
   - You're trying to mint positions after expiry
   - Deploy a new contract or wait for the current one to settle

2. **"Insufficient contract balance" on payout**
   - Not enough liquidity in the contract
   - Add more liquidity or reduce position sizes

3. **FTSO price is 0 or stale**
   - FTSO may not support the requested symbol
   - Check available symbols at: https://dev.flare.network/ftso/overview

4. **Transaction reverts on settlement**
   - Ensure contract has expired
   - Check FTSO data is available and recent

## Resources

- [Flare Documentation](https://dev.flare.network)
- [FTSO Reference](https://dev.flare.network/ftso/solidity-reference)
- [FDC Documentation](https://dev.flare.network/fdc/overview)
- [Flare Explorer](https://flare-explorer.flare.network)
- [Coston2 Faucet](https://faucet.flare.network/coston2)

## License

MIT License - see LICENSE file for details

## Contributing

Contributions welcome! Please open an issue or PR.

## Disclaimer

This is experimental software. Use at your own risk. Not financial advice.
