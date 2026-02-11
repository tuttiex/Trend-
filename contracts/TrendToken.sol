// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TrendToken
 * @dev ERC20 token deployed by the Trend Agent based on X trends.
 * Features immutable metadata to link the token to its origin trend.
 */
contract TrendToken is ERC20 {
    string public trendTopic;
    string public trendRegion;
    uint256 public immutable deploymentTimestamp;
    address public immutable deployerAgent;

    event TrendTokenDeployed(
        string topic,
        string region,
        uint256 indexed timestamp,
        address indexed deployer
    );

    /**
     * @dev Constructor that gives msg.sender all of existing tokens.
     * @param name The name of the token (e.g., "Romero Coin")
     * @param symbol The symbol of the token (e.g., "ROME")
     * @param _trendTopic The trend that triggered this deployment
     * @param _trendRegion The region where the trend was detected
     */
    constructor(
        string memory name,
        string memory symbol,
        string memory _trendTopic,
        string memory _trendRegion
    ) ERC20(name, symbol) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(name).length <= 100, "Name too long");
        require(bytes(symbol).length > 0, "Symbol cannot be empty");
        require(bytes(symbol).length <= 20, "Symbol too long");
        require(bytes(_trendTopic).length > 0, "Trend topic cannot be empty");
        require(bytes(_trendRegion).length > 0, "Trend region cannot be empty");
        require(bytes(_trendTopic).length <= 256, "Trend topic too long");
        require(bytes(_trendRegion).length <= 100, "Trend region too long");

        trendTopic = _trendTopic;
        trendRegion = _trendRegion;
        deploymentTimestamp = block.timestamp;
        deployerAgent = msg.sender;

        // Mint 1 billion tokens (18 decimals) to the agent
        _mint(msg.sender, 1_000_000_000 * 10**18);

        emit TrendTokenDeployed(_trendTopic, _trendRegion, block.timestamp, msg.sender);
    }

    // No minting functions added = Fixed Supply
    // No 'onlyOwner' or administrative functions = Trustless
}