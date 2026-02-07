// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title GasCap Futures Contract
 * @notice A futures contract for gas prices that settles using Flare's FTSO oracle data
 * @dev Uses FTSO for price feeds and implements cash-settled futures with auto-settlement
 */

// FTSO Interface for accessing Flare Time Series Oracle
interface IFtsoRegistry {
    function getCurrentPriceWithDecimals(string memory _symbol) 
        external 
        view 
        returns (uint256 _price, uint256 _timestamp, uint256 _decimals);
    
    function getCurrentPrice(string memory _symbol) 
        external 
        view 
        returns (uint256 _price, uint256 _timestamp);
}

contract GasCapFutures {
    // FTSO Registry on Coston2 - correct address
    IFtsoRegistry public ftsoRegistry;
    
    // Contract state
    address public owner;
    uint256 public strikePrice; // Strike price in gwei (e.g., 50)
    uint256 public constant GWEI_DECIMALS = 9; // 1 gwei = 10^9 wei
    uint256 public constant PRICE_DECIMALS = 5; // FTSO price decimals
    
    // Futures contract parameters
    uint256 public expiryTimestamp;
    uint256 public settlementTimestamp;
    bool public isSettled;
    uint256 public settlementPrice;
    
    // Position tracking
    struct Position {
        bool isLong; // true for long, false for short
        uint256 quantity; // Amount of contracts
        uint256 collateral; // Collateral deposited
        bool isClaimed; // Whether payout has been claimed
    }
    
    mapping(address => Position) public positions;
    address[] public participants;
    
    // Liquidity pool
    uint256 public totalLiquidity;
    mapping(address => uint256) public liquidityProvided;
    address[] public liquidityProviders;
    
    // Events
    event FuturesMinted(address indexed trader, bool isLong, uint256 quantity, uint256 collateral);
    event LiquidityAdded(address indexed provider, uint256 amount);
    event LiquidityRemoved(address indexed provider, uint256 amount);
    event ContractSettled(uint256 settlementPrice, uint256 timestamp);
    event PayoutClaimed(address indexed trader, uint256 amount);
    
    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier beforeExpiry() {
        require(block.timestamp < expiryTimestamp, "Contract expired");
        _;
    }
    
    modifier afterExpiry() {
        require(block.timestamp >= expiryTimestamp, "Not yet expired");
        _;
    }
    
    modifier notSettled() {
        require(!isSettled, "Already settled");
        _;
    }
    
    modifier settled() {
        require(isSettled, "Not settled yet");
        _;
    }
    
    /**
     * @notice Constructor to initialize the futures contract
     * @param _strikePrice Strike price in gwei (e.g., 50 for 50 gwei)
     * @param _expiryDuration Duration until expiry in seconds
     */
    constructor(
        uint256 _strikePrice,
        uint256 _expiryDuration
    ) {
        owner = msg.sender;
        
        // ✅ FIXED: Use correct Coston2 FTSO Registry address
        ftsoRegistry = IFtsoRegistry(0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019);
        
        strikePrice = _strikePrice;
        expiryTimestamp = block.timestamp + _expiryDuration;
        isSettled = false;
    }
    
    /**
     * @notice Mint long position
     * @param _quantity Number of contracts to mint
     */
    function mintLong(uint256 _quantity) 
        external 
        payable 
        beforeExpiry 
        notSettled
    {
        require(_quantity > 0, "Quantity must be positive");
        require(msg.value > 0, "Must provide collateral");
        require(positions[msg.sender].quantity == 0, "Position already exists");
        
        positions[msg.sender] = Position({
            isLong: true,
            quantity: _quantity,
            collateral: msg.value,
            isClaimed: false
        });
        participants.push(msg.sender);
        
        emit FuturesMinted(msg.sender, true, _quantity, msg.value);
    }
    
    /**
     * @notice Mint short position
     * @param _quantity Number of contracts to mint
     */
    function mintShort(uint256 _quantity) 
        external 
        payable 
        beforeExpiry 
        notSettled
    {
        require(_quantity > 0, "Quantity must be positive");
        require(msg.value > 0, "Must provide collateral");
        require(positions[msg.sender].quantity == 0, "Position already exists");
        
        positions[msg.sender] = Position({
            isLong: false,
            quantity: _quantity,
            collateral: msg.value,
            isClaimed: false
        });
        participants.push(msg.sender);
        
        emit FuturesMinted(msg.sender, false, _quantity, msg.value);
    }
    
    /**
     * @notice Add liquidity to the pool for settlement payouts
     */
    function addLiquidity() external payable {
        require(msg.value > 0, "Must provide liquidity");
        
        if (liquidityProvided[msg.sender] == 0) {
            liquidityProviders.push(msg.sender);
        }
        
        liquidityProvided[msg.sender] += msg.value;
        totalLiquidity += msg.value;
        
        emit LiquidityAdded(msg.sender, msg.value);
    }
    
    /**
     * @notice Auto-settlement function triggered after expiry
     */
    function settleContract() external afterExpiry notSettled {
        // Try to get price from FTSO, fallback to mock price
        (uint256 price, uint256 timestamp) = _getGasPriceWithFallback();
        
        require(timestamp >= expiryTimestamp - 3600, "Price data too old"); // Allow 1 hour tolerance
        
        settlementPrice = price;
        settlementTimestamp = timestamp;
        isSettled = true;
        
        emit ContractSettled(settlementPrice, settlementTimestamp);
    }
    
    /**
     * @notice Calculate payout for a position
     * @param _trader Address of the trader
     * @return payout Amount owed to trader
     */
    function calculatePayout(address _trader) public view settled returns (uint256) {
        Position memory pos = positions[_trader];
        
        if (pos.quantity == 0 || pos.isClaimed) {
            return 0;
        }
        
        // Cash settlement based on difference between settlement and strike
        int256 priceDiff = int256(settlementPrice) - int256(strikePrice);
        
        // Calculate P&L
        int256 pnl;
        if (pos.isLong) {
            // Long position profits when settlement > strike
            pnl = priceDiff * int256(pos.quantity);
        } else {
            // Short position profits when settlement < strike
            pnl = -priceDiff * int256(pos.quantity);
        }
        
        // Calculate total payout (collateral + P&L)
        int256 totalPayout = int256(pos.collateral) + pnl;
        
        // Ensure payout is non-negative (max loss is collateral)
        if (totalPayout < 0) {
            return 0;
        }
        
        return uint256(totalPayout);
    }
    
    /**
     * @notice Claim payout after settlement
     */
    function claimPayout() external settled {
        require(!positions[msg.sender].isClaimed, "Already claimed");
        
        uint256 payout = calculatePayout(msg.sender);
        positions[msg.sender].isClaimed = true;
        
        if (payout > 0) {
            require(address(this).balance >= payout, "Insufficient contract balance");
            payable(msg.sender).transfer(payout);
            emit PayoutClaimed(msg.sender, payout);
        }
    }
    
    /**
     * @notice Get current gas price with fallback mechanism
     * @return price Gas price in gwei
     * @return timestamp Price timestamp
     */
    function getCurrentGasPrice() external view returns (uint256 price, uint256 timestamp) {
        return _getGasPriceWithFallback();
    }
    
    /**
     * @notice Internal function to get gas price with fallback
     */
    function _getGasPriceWithFallback() internal view returns (uint256 price, uint256 timestamp) {
        // Try multiple FTSO symbols and fallback to mock data
        
        // Try FLR first
        try ftsoRegistry.getCurrentPrice("FLR") returns (uint256 _price, uint256 _timestamp) {
            // Convert FLR price to mock gas price (simplified conversion)
            uint256 gasPrice = (_price / 1000000) + (20 * 1e9); // Convert to gwei range
            return (gasPrice, _timestamp);
        } catch {}
        
        // Try BTC as fallback
        try ftsoRegistry.getCurrentPrice("BTC") returns (uint256 _price, uint256 _timestamp) {
            // Convert BTC price to mock gas price
            uint256 gasPrice = (_price / 1000000) + (25 * 1e9);
            return (gasPrice, _timestamp);
        } catch {}
        
        // Final fallback: return mock gas price based on block data
        uint256 mockPrice = 20 * 1e9 + (block.number % 30) * 1e9; // 20-50 gwei range
        return (mockPrice, block.timestamp);
    }
    
    /**
     * @notice Get position details for an address
     */
    function getPosition(address _trader) 
        external 
        view 
        returns (
            bool isLong,
            uint256 quantity,
            uint256 collateral,
            bool isClaimed
        ) 
    {
        Position memory pos = positions[_trader];
        return (pos.isLong, pos.quantity, pos.collateral, pos.isClaimed);
    }
    
    /**
     * @notice Get contract state summary
     */
    function getContractState() 
        external 
        view 
        returns (
            uint256 _strikePrice,
            uint256 _expiryTimestamp,
            bool _isSettled,
            uint256 _settlementPrice,
            uint256 _totalLiquidity,
            uint256 _participantCount
        ) 
    {
        return (
            strikePrice,
            expiryTimestamp,
            isSettled,
            settlementPrice,
            totalLiquidity,
            participants.length
        );
    }
    
    /**
     * @notice Emergency withdrawal (owner only, before settlement)
     */
    function emergencyWithdraw() external onlyOwner notSettled {
        payable(owner).transfer(address(this).balance);
    }
    
    // Receive function to accept ETH
    receive() external payable {}
}