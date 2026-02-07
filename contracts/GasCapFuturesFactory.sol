// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./GasCapFutures.sol";

/**
 * @title GasCapFuturesFactory
 * @notice On-chain registry and factory for GasCapFutures markets.
 * @dev Deploys new GasCapFutures instances and keeps a registry of all markets.
 */
contract GasCapFuturesFactory {
    struct MarketInfo {
        address market;
        address creator;
        uint256 createdAt;
    }

    address public owner;
    MarketInfo[] public markets;

    // creator => list of market indices
    mapping(address => uint256[]) public marketsByCreator;

    event MarketCreated(
        address indexed market,
        address indexed creator,
        uint256 index,
        uint256 strikePrice,
        uint256 expiryTimestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Deploy a new GasCapFutures market and register it.
     * @param _strikePrice Strike price in gwei
     * @param _expiryDuration Duration until expiry in seconds
     * @param _marketName Human-readable name
     * @param _marketDescription Description / metadata
     */
    function createMarket(
        uint256 _strikePrice,
        uint256 _expiryDuration,
        string memory _marketName,
        string memory _marketDescription
    ) external returns (address marketAddress, uint256 index) {
        GasCapFutures market = new GasCapFutures(
            _strikePrice,
            _expiryDuration,
            _marketName,
            _marketDescription
        );
        marketAddress = address(market);

        markets.push(
            MarketInfo({
                market: marketAddress,
                creator: msg.sender,
                createdAt: block.timestamp
            })
        );

        index = markets.length - 1;
        marketsByCreator[msg.sender].push(index);

        emit MarketCreated(
            marketAddress,
            msg.sender,
            index,
            _strikePrice,
            market.expiryTimestamp()
        );
    }

    /**
     * @notice Number of markets created.
     */
    function marketsCount() external view returns (uint256) {
        return markets.length;
    }

    /**
     * @notice Get info for a market by index.
     */
    function getMarket(uint256 index)
        external
        view
        returns (address market, address creator, uint256 createdAt)
    {
        require(index < markets.length, "Index out of range");
        MarketInfo memory info = markets[index];
        return (info.market, info.creator, info.createdAt);
    }

    /**
     * @notice Get all markets (addresses only).
     */
    function getAllMarkets() external view returns (address[] memory list) {
        uint256 len = markets.length;
        list = new address[](len);
        for (uint256 i = 0; i < len; i++) {
            list[i] = markets[i].market;
        }
    }

    /**
     * @notice Get market indices created by a specific address.
     */
    function getMarketsByCreator(address creator)
        external
        view
        returns (uint256[] memory indices)
    {
        return marketsByCreator[creator];
    }
}