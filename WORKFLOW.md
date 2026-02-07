# GasCap Futures - Complete Workflow

## 🔄 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Flare Network (Coston2)                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌─────────────────┐              │
│  │ FTSO Registry│◄────────│  GasCapFutures  │              │
│  │  (Oracle)    │  Price  │   Smart Contract│              │
│  └──────────────┘  Feed   └─────────────────┘              │
│                                    ▲                         │
│                                    │                         │
│                     ┌──────────────┼──────────────┐         │
│                     │              │              │         │
│              ┌──────▼────┐  ┌──────▼────┐  ┌─────▼─────┐  │
│              │  Traders  │  │ Liquidity │  │  Settlers │  │
│              │ (Long/Short) │ Providers │  │(Anyone)   │  │
│              └───────────┘  └───────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 📋 User Workflows

### 1️⃣ Trader Workflow (Long Position)

```
START
  │
  ├─► Check current FTSO price
  │   (npx hardhat run scripts/interact.js)
  │
  ├─► Analyze: Is price likely to go UP?
  │   Current: 45 gwei, Strike: 50 gwei
  │
  ├─► Open LONG position
  │   (npx hardhat run scripts/mint-long.js)
  │   - Quantity: 10 contracts
  │   - Collateral: 1 FLR
  │
  ├─► Wait for expiry (7 days)
  │   - Monitor price with interact.js
  │
  ├─► Settlement occurs
  │   - Final price: 60 gwei
  │   - YOU WIN! 📈
  │
  └─► Claim payout
      (npx hardhat run scripts/claim.js)
      Profit = (60 - 50) × 10 = +100 gwei equivalent
      Receive: 1 FLR collateral + profit
END
```

### 2️⃣ Trader Workflow (Short Position)

```
START
  │
  ├─► Check current FTSO price
  │   Current: 65 gwei, Strike: 50 gwei
  │
  ├─► Analyze: Is price likely to go DOWN?
  │   Think gas fees will decrease
  │
  ├─► Open SHORT position
  │   (npx hardhat run scripts/mint-short.js)
  │   - Quantity: 5 contracts
  │   - Collateral: 0.5 FLR
  │
  ├─► Wait for expiry
  │
  ├─► Settlement occurs
  │   - Final price: 40 gwei
  │   - YOU WIN! 📉
  │
  └─► Claim payout
      Profit = (50 - 40) × 5 = +50 gwei equivalent
END
```

### 3️⃣ Liquidity Provider Workflow

```
START
  │
  ├─► Add liquidity to pool
  │   (npx hardhat run scripts/add-liquidity.js)
  │   - Amount: 10 FLR
  │
  ├─► Liquidity supports payouts
  │   - Traders can settle positions
  │   - Pool earns potential fees (in extended version)
  │
  ├─► Monitor contract
  │   - Wait for settlement
  │
  └─► After settlement
      - Can claim share of fees (if implemented)
      - Or withdraw if before settlement
END
```

### 4️⃣ Settlement Workflow (Anyone can trigger)

```
START
  │
  ├─► Wait for contract expiry
  │   Expiry: 7 days after deployment
  │
  ├─► Check contract is expired
  │   (npx hardhat run scripts/interact.js)
  │
  ├─► Trigger settlement
  │   (npx hardhat run scripts/settle.js)
  │   
  ├─► Contract queries FTSO
  │   Gets final gas price from oracle
  │
  ├─► Settlement price locked
  │   Price: 55 gwei
  │
  └─► Traders can now claim
      Settlement complete ✅
END
```

## 🎯 Complete Lifecycle Example

```
Day 0 (Friday):
├─► Deploy contract
│   Strike: 50 gwei, Expiry: 7 days
│   (npx hardhat run scripts/deploy.js --network coston2)
│
├─► Alice adds 10 FLR liquidity
│   (CONTRACT_ADDRESS=0x... npx hardhat run scripts/add-liquidity.js)
│
├─► Bob opens LONG (10 contracts, 1 FLR)
│   Betting price will rise
│   (CONTRACT_ADDRESS=0x... npx hardhat run scripts/mint-long.js)
│
└─► Carol opens SHORT (10 contracts, 1 FLR)
    Betting price will fall
    (CONTRACT_ADDRESS=0x... npx hardhat run scripts/mint-short.js)

Day 1-6:
├─► Everyone monitors FTSO price
│   (CONTRACT_ADDRESS=0x... npx hardhat run scripts/interact.js)
│
└─► Price fluctuates: 45 → 52 → 48 → 55 gwei

Day 7 (Friday):
├─► Contract expires
│   Current FTSO price: 58 gwei
│
├─► Alice triggers settlement
│   (CONTRACT_ADDRESS=0x... npx hardhat run scripts/settle.js)
│   Final settlement price: 58 gwei
│
├─► Bob claims payout (LONG winner)
│   (CONTRACT_ADDRESS=0x... npx hardhat run scripts/claim.js)
│   Profit: (58 - 50) × 10 = +80 gwei
│   Receives: 1 FLR + profit 📈
│
└─► Carol claims payout (SHORT loser)
    Loss: (50 - 58) × 10 = -80 gwei
    Receives: less than 1 FLR 📉
```

## 📊 Price Scenarios

### Scenario A: Price Rises (Longs Win)
```
Strike Price: 50 gwei
Settlement Price: 65 gwei
Difference: +15 gwei

LONG Position (10 contracts):
  P&L: +15 × 10 = +150 gwei equivalent
  Result: 📈 PROFIT

SHORT Position (10 contracts):
  P&L: -15 × 10 = -150 gwei equivalent
  Result: 📉 LOSS
```

### Scenario B: Price Falls (Shorts Win)
```
Strike Price: 50 gwei
Settlement Price: 35 gwei
Difference: -15 gwei

LONG Position (10 contracts):
  P&L: -15 × 10 = -150 gwei equivalent
  Result: 📉 LOSS

SHORT Position (10 contracts):
  P&L: +15 × 10 = +150 gwei equivalent
  Result: 📈 PROFIT
```

### Scenario C: Price At Strike (Draw)
```
Strike Price: 50 gwei
Settlement Price: 50 gwei
Difference: 0 gwei

LONG Position: Break even (collateral returned)
SHORT Position: Break even (collateral returned)
```

## 🛠️ Command Reference by Role

### 👨‍💼 Contract Owner
```bash
# Deploy
npx hardhat run scripts/deploy.js --network coston2

# Monitor
CONTRACT_ADDRESS=0x... npx hardhat run scripts/interact.js --network coston2
```

### 📈 Trader (Going Long)
```bash
# Check price
CONTRACT_ADDRESS=0x... npx hardhat run scripts/interact.js --network coston2

# Open position
CONTRACT_ADDRESS=0x... QUANTITY=10 COLLATERAL=1 \
  npx hardhat run scripts/mint-long.js --network coston2

# Check position
CONTRACT_ADDRESS=0x... npx hardhat run scripts/interact.js --network coston2

# Claim (after settlement)
CONTRACT_ADDRESS=0x... npx hardhat run scripts/claim.js --network coston2
```

### 📉 Trader (Going Short)
```bash
# Open position
CONTRACT_ADDRESS=0x... QUANTITY=5 COLLATERAL=0.5 \
  npx hardhat run scripts/mint-short.js --network coston2

# Rest same as long trader
```

### 💰 Liquidity Provider
```bash
# Add liquidity
CONTRACT_ADDRESS=0x... AMOUNT=10 \
  npx hardhat run scripts/add-liquidity.js --network coston2

# Monitor
CONTRACT_ADDRESS=0x... npx hardhat run scripts/interact.js --network coston2
```

### ⚡ Anyone (Settlement)
```bash
# Settle contract (after expiry)
CONTRACT_ADDRESS=0x... npx hardhat run scripts/settle.js --network coston2
```

## 🎮 Testing Scenarios

### Quick Test (Local Network)
```bash
# Terminal 1: Start local node
npx hardhat node

# Terminal 2: Deploy and test
npx hardhat run scripts/deploy.js --network localhost
CONTRACT_ADDRESS=0x... npx hardhat run scripts/mint-long.js --network localhost
# Fast-forward time in tests
CONTRACT_ADDRESS=0x... npx hardhat run scripts/settle.js --network localhost
CONTRACT_ADDRESS=0x... npx hardhat run scripts/claim.js --network localhost
```

### Full Test (Coston2 Testnet)
```bash
# 1. Deploy (Friday evening)
npx hardhat run scripts/deploy.js --network coston2
# Save CONTRACT_ADDRESS

# 2. Trade (Friday-Saturday)
CONTRACT_ADDRESS=0x... npx hardhat run scripts/mint-long.js --network coston2
CONTRACT_ADDRESS=0x... npx hardhat run scripts/add-liquidity.js --network coston2

# 3. Monitor (throughout week)
CONTRACT_ADDRESS=0x... npx hardhat run scripts/interact.js --network coston2

# 4. Settle (next Friday)
CONTRACT_ADDRESS=0x... npx hardhat run scripts/settle.js --network coston2

# 5. Claim
CONTRACT_ADDRESS=0x... npx hardhat run scripts/claim.js --network coston2
```

## 📱 Integration Paths

### Frontend Integration
```javascript
// React/Next.js + ethers.js
import { Contract } from 'ethers';

const contract = new Contract(address, abi, signer);
await contract.mintFuture(true, 10, { value: parseEther("1") });
```

### Backend Monitoring
```javascript
// Node.js cron job
contract.on("ContractSettled", (price, timestamp) => {
  console.log("Settled at:", price);
  // Notify users, trigger claims, etc.
});
```

### Multi-Contract Dashboard
```javascript
// Monitor multiple futures contracts
const contracts = ['0xabc...', '0xdef...'];
for (const addr of contracts) {
  const state = await getState(addr);
  // Display all active contracts
}
```

## 🎯 Success Metrics

✅ Contract deployed on Coston2
✅ FTSO oracle integration working
✅ Long positions opened
✅ Short positions opened
✅ Liquidity added to pool
✅ Contract expired and settled
✅ Payouts claimed successfully
✅ All transactions visible on block explorer

---

**Happy Trading! 🚀**
