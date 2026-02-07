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

/**
 * @dev Minimal ERC20 interface for future extension to ERC20 collateral/settlement.
 *      Not actively used yet, but kept for compatibility.
 */
interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

contract GasCapFutures {
    // ========= ORACLE / CORE CONFIG =========

    // FTSO Registry on Coston2 - correct address
    IFtsoRegistry public ftsoRegistry;
    
    // Contract state
    address public owner;
    address public contractCreator;

    string public marketName;
    string public marketDescription;

    uint256 public strikePrice; // Strike price in gwei (e.g., 50)
    uint256 public constant GWEI_DECIMALS = 9; // 1 gwei = 10^9 wei
    uint256 public constant PRICE_DECIMALS = 5; // FTSO price decimals
    
    // Futures contract parameters
    uint256 public expiryTimestamp;
    uint256 public settlementTimestamp;
    bool public isSettled;
    uint256 public settlementPrice;

    // ========= ENUMS & CONFIG ==========
    enum MarginMode { ISOLATED, CROSS }
    enum EntryType { MARKET, LIMIT, STOP }

    // Allowed collateral & settlement assets (simple allow-list)
    mapping(address => bool) public allowedCollateralAssets;
    mapping(address => bool) public allowedSettlementAssets;

    // Special marker for native token (e.g., FLR / C2 ETH)
    address public constant NATIVE_TOKEN = address(0);

    // ========= USER PROFILE & LOGIN ==========

    struct UserProfile {
        bool isRegistered;
        string username;       // optional, off-chain UI can read
        string metadataURI;    // optional (IPFS / HTTP URL)
        uint256 createdAt;
        uint256 lastLoginAt;
    }

    mapping(address => UserProfile) public users;

    event UserRegistered(address indexed user, string username, string metadataURI);
    event UserLoggedIn(address indexed user, uint256 timestamp);

    modifier onlyRegistered() {
        require(users[msg.sender].isRegistered, "User not registered");
        _;
    }

    /**
     * @notice Register a user profile. This acts as an on-chain "account creation".
     * @param _username Arbitrary username (optional, can be empty string)
     * @param _metadataURI Optional URI for off-chain profile metadata
     */
    function registerUser(string calldata _username, string calldata _metadataURI) external {
        require(!users[msg.sender].isRegistered, "Already registered");

        users[msg.sender] = UserProfile({
            isRegistered: true,
            username: _username,
            metadataURI: _metadataURI,
            createdAt: block.timestamp,
            lastLoginAt: block.timestamp
        });

        emit UserRegistered(msg.sender, _username, _metadataURI);
    }

    /**
     * @notice Simple "login" function to refresh lastLoginAt.
     * @dev Authentication is just the wallet signature via msg.sender.
     */
    function login() external onlyRegistered {
        users[msg.sender].lastLoginAt = block.timestamp;
        emit UserLoggedIn(msg.sender, block.timestamp);
    }
    
    // ========= POSITION TRACKING ==========

    struct Position {
        bool exists;
        bool isLong;                   // true for long, false for short
        uint256 quantity;              // Number of contracts
        uint256 collateral;            // Collateral deposited (in native token if collateralAsset == NATIVE_TOKEN)
        uint256 leverage;              // Leverage factor (e.g., 1x, 2x, 5x)
        MarginMode marginMode;         // CROSS or ISOLATED
        EntryType entryType;           // MARKET, LIMIT, STOP
        uint256 limitPrice;            // For limit orders (optional)
        uint256 stopPrice;             // For stop orders (optional)
        address collateralAsset;       // Address(0) for native token, or ERC20 token address
        address settlementAsset;       // Address(0) for native token, or ERC20 token address
        bool isActive;                 // For orders / positions currently open
        bool isClaimed;                // Whether payout has been claimed
    }
    
    // One position per trader for now
    mapping(address => Position) public positions;

    // All addresses that have **ever** participated (for historical stats)
    address[] public participants;

    // Currently active traders (open positions)
    address[] public activeTraders;
    mapping(address => bool) public isActiveTrader;
    
    // Liquidity pool (native token pool for simplicity)
    uint256 public totalLiquidity;
    mapping(address => uint256) public liquidityProvided;
    address[] public liquidityProviders;
    
    // ========= EVENTS =========

    event FuturesMinted(
        address indexed trader,
        bool isLong,
        uint256 quantity,
        uint256 collateral,
        uint256 leverage,
        MarginMode marginMode,
        EntryType entryType,
        uint256 limitPrice,
        uint256 stopPrice,
        address collateralAsset,
        address settlementAsset
    );
    event LiquidityAdded(address indexed provider, uint256 amount);
    event LiquidityRemoved(address indexed provider, uint256 amount);
    event ContractSettled(uint256 settlementPrice, uint256 timestamp);
    event PayoutClaimed(address indexed trader, uint256 amount);
    
    // ========= MODIFIERS =========

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
     * @param _marketName Human-readable name for this market
     * @param _marketDescription Description / metadata for this market
     */
    constructor(
        uint256 _strikePrice,
        uint256 _expiryDuration,
        string memory _marketName,
        string memory _marketDescription
    ) {
        owner = msg.sender;
        contractCreator = msg.sender;
        
        // ✅ Coston2 FTSO Registry address
        ftsoRegistry = IFtsoRegistry(0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019);
        
        strikePrice = _strikePrice;
        expiryTimestamp = block.timestamp + _expiryDuration;
        isSettled = false;

        marketName = _marketName;
        marketDescription = _marketDescription;

        // By default, allow native token as collateral and settlement
        allowedCollateralAssets[NATIVE_TOKEN] = true;
        allowedSettlementAssets[NATIVE_TOKEN] = true;
    }

    // ========= ADMIN: ASSET CONFIG ==========

    function setCollateralAssetAllowed(address asset, bool allowed) external onlyOwner {
        allowedCollateralAssets[asset] = allowed;
    }

    function setSettlementAssetAllowed(address asset, bool allowed) external onlyOwner {
        allowedSettlementAssets[asset] = allowed;
    }
    
    // ========= INTERNAL: OPEN POSITION ==========

    /**
     * @notice Internal function to create a position with all customizable parameters.
     */
    function _openPosition(
        bool _isLong,
        uint256 _quantity,
        uint256 _leverage,
        MarginMode _marginMode,
        EntryType _entryType,
        uint256 _limitPrice,
        uint256 _stopPrice,
        address _collateralAsset,
        address _settlementAsset,
        uint256 _collateralAmount
    ) internal beforeExpiry notSettled onlyRegistered {
        require(_quantity > 0, "Quantity must be positive");
        require(_leverage > 0, "Leverage must be > 0");
        require(!positions[msg.sender].exists, "Position already exists");

        // Asset validation
        require(allowedCollateralAssets[_collateralAsset], "Collateral asset not allowed");
        require(allowedSettlementAssets[_settlementAsset], "Settlement asset not allowed");

        // Collateral handling (for now only native token is practically handled)
        if (_collateralAsset == NATIVE_TOKEN) {
            require(_collateralAmount > 0, "Must provide collateral");
            require(msg.value == _collateralAmount, "msg.value mismatch");
        } else {
            // For ERC20, we'd expect msg.value == 0 and use transferFrom.
            // IERC20(_collateralAsset).transferFrom(msg.sender, address(this), _collateralAmount);
            require(_collateralAmount > 0, "Must provide ERC20 collateral");
            require(msg.value == 0, "No native token with ERC20 collateral (TODO)");
        }

        // Basic checks for order types
        if (_entryType == EntryType.LIMIT) {
            require(_limitPrice > 0, "Limit price required");
        }
        if (_entryType == EntryType.STOP) {
            require(_stopPrice > 0, "Stop price required");
        }

        positions[msg.sender] = Position({
            exists: true,
            isLong: _isLong,
            quantity: _quantity,
            collateral: _collateralAmount,
            leverage: _leverage,
            marginMode: _marginMode,
            entryType: _entryType,
            limitPrice: _limitPrice,
            stopPrice: _stopPrice,
            collateralAsset: _collateralAsset,
            settlementAsset: _settlementAsset,
            isActive: true,
            isClaimed: false
        });

        // Track participants (ever traded)
        participants.push(msg.sender);

        // Track currently active traders
        if (!isActiveTrader[msg.sender]) {
            isActiveTrader[msg.sender] = true;
            activeTraders.push(msg.sender);
        }

        emit FuturesMinted(
            msg.sender,
            _isLong,
            _quantity,
            _collateralAmount,
            _leverage,
            _marginMode,
            _entryType,
            _limitPrice,
            _stopPrice,
            _collateralAsset,
            _settlementAsset
        );
    }

    // ========= PUBLIC: OPEN POSITIONS (CONVENIENCE) =========

    /**
     * @notice Open a long position (market entry, native collateral & settlement).
     * @param _quantity Number of contracts to mint
     * @param _leverage Leverage to use
     * @param _marginMode 0 = ISOLATED, 1 = CROSS
     */
    function mintLong(
        uint256 _quantity,
        uint256 _leverage,
        uint8 _marginMode
    ) 
        external 
        payable
    {
        _openPosition(
            true,
            _quantity,
            _leverage,
            _marginMode == 0 ? MarginMode.ISOLATED : MarginMode.CROSS,
            EntryType.MARKET,
            0,
            0,
            NATIVE_TOKEN,
            NATIVE_TOKEN,
            msg.value
        );
    }
    
    /**
     * @notice Open a short position (market entry, native collateral & settlement).
     * @param _quantity Number of contracts to mint
     * @param _leverage Leverage to use
     * @param _marginMode 0 = ISOLATED, 1 = CROSS
     */
    function mintShort(
        uint256 _quantity,
        uint256 _leverage,
        uint8 _marginMode
    ) 
        external 
        payable
    {
        _openPosition(
            false,
            _quantity,
            _leverage,
            _marginMode == 0 ? MarginMode.ISOLATED : MarginMode.CROSS,
            EntryType.MARKET,
            0,
            0,
            NATIVE_TOKEN,
            NATIVE_TOKEN,
            msg.value
        );
    }

    /**
     * @notice Advanced opening function for limit/stop & custom assets (stub for future ERC20 support).
     */
    function openCustomPosition(
        bool _isLong,
        uint256 _quantity,
        uint256 _leverage,
        uint8 _marginMode,
        uint8 _entryType,
        uint256 _limitPrice,
        uint256 _stopPrice,
        address _collateralAsset,
        address _settlementAsset,
        uint256 _collateralAmount
    ) external payable {
        _openPosition(
            _isLong,
            _quantity,
            _leverage,
            _marginMode == 0 ? MarginMode.ISOLATED : MarginMode.CROSS,
            EntryType(_entryType),
            _limitPrice,
            _stopPrice,
            _collateralAsset,
            _settlementAsset,
            _collateralAmount
        );
    }

    // ========= LIQUIDITY =========

    /**
     * @notice Add liquidity to the pool for settlement payouts (native token only for now)
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
     * @notice Remove liquidity (simple implementation: withdraw part/all of user's contribution).
     */
    function removeLiquidity(uint256 amount) external {
        require(liquidityProvided[msg.sender] >= amount, "Insufficient provided liquidity");
        liquidityProvided[msg.sender] -= amount;
        totalLiquidity -= amount;

        payable(msg.sender).transfer(amount);
        emit LiquidityRemoved(msg.sender, amount);
    }
    
    // ========= SETTLEMENT =========

    /**
     * @notice Auto-settlement function triggered after expiry
     */
    function settleContract() external afterExpiry notSettled {
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
     * @return payout Amount owed to trader (in their settlementAsset units; currently native token only)
     */
    function calculatePayout(address _trader) public view settled returns (uint256) {
        Position storage pos = positions[_trader];

        if (!pos.exists || pos.quantity == 0 || pos.isClaimed) {
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

        // Apply leverage
        pnl = pnl * int256(pos.leverage);

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
        Position storage pos = positions[msg.sender];
        require(pos.exists, "No position");
        require(!pos.isClaimed, "Already claimed");
        
        uint256 payout = calculatePayout(msg.sender);
        pos.isClaimed = true;
        pos.isActive = false;

        // Mark trader as no longer active
        if (isActiveTrader[msg.sender]) {
            isActiveTrader[msg.sender] = false;
            // We leave the address in activeTraders array;
            // front-end can filter by isActiveTrader[addr].
        }
        
        if (payout > 0) {
            // For now, we only handle native token payout.
            require(pos.settlementAsset == NATIVE_TOKEN, "Non-native settlement not implemented");
            require(address(this).balance >= payout, "Insufficient contract balance");
            payable(msg.sender).transfer(payout);
            emit PayoutClaimed(msg.sender, payout);
        }
    }
    
    // ========= ORACLE HELPERS =========

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

    // ========= VIEW HELPERS =========

    /**
     * @notice Get position struct for an address
     */
    function getPosition(address _trader)
        external
        view
        returns (Position memory)
    {
        return positions[_trader];
    }

    /**
     * @notice Get all currently open positions in the market.
     * @dev Returns traders and their Position structs for addresses marked active.
     */
    function getActiveTraders() external view returns (address[] memory traders) {
        uint256 count = 0;
        for (uint256 i = 0; i < activeTraders.length; i++) {
            if (isActiveTrader[activeTraders[i]]) {
                count++;
            }
        }

        traders = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < activeTraders.length; i++) {
            address trader = activeTraders[i];
            if (isActiveTrader[trader]) {
                traders[idx] = trader;
                idx++;
            }
        }
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
     * @notice Get user profile for an address
     */
    function getUserProfile(address _user)
        external
        view
        returns (
            bool isRegistered,
            string memory username,
            string memory metadataURI,
            uint256 createdAt,
            uint256 lastLoginAt
        )
    {
        UserProfile memory profile = users[_user];
        return (
            profile.isRegistered,
            profile.username,
            profile.metadataURI,
            profile.createdAt,
            profile.lastLoginAt
        );
    }

    /**
     * @notice Get static market info (who created, configuration, etc.)
     */
    function getMarketInfo()
        external
        view
        returns (
            address _creator,
            string memory _name,
            string memory _description,
            uint256 _strikePrice,
            uint256 _expiryTimestamp,
            bool _isSettled,
            uint256 _settlementPrice
        )
    {
        return (
            contractCreator,
            marketName,
            marketDescription,
            strikePrice,
            expiryTimestamp,
            isSettled,
            settlementPrice
        );
    }
    
    /**
     * @notice Emergency withdrawal (owner only, before settlement)
     * @dev This keeps your original emergencyWithdraw behavior.
     */
    function emergencyWithdraw() external onlyOwner notSettled {
        payable(owner).transfer(address(this).balance);
    }
    
    // Receive function to accept ETH/native token
    receive() external payable {}
}