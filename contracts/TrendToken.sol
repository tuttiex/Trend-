// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TrendToken
 * @notice ERC20 token deployed by the Trend Agent based on X trends.
 */
contract TrendToken is ERC20 {
    string public trendTopic;
    string public trendRegion;
    address public immutable deployerAgent;

    event TrendTokenDeployed(
        string topic,
        string region,
        address indexed deployer
    );

    constructor(
        string memory name,
        string memory symbol,
        string memory _trendTopic,
        string memory _trendRegion
    ) ERC20(name, symbol) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(symbol).length > 0, "Symbol cannot be empty");
        require(bytes(_trendTopic).length > 0, "Trend topic cannot be empty");
        require(bytes(_trendRegion).length > 0, "Trend region cannot be empty");

        trendTopic = _trendTopic;
        trendRegion = _trendRegion;
        deployerAgent = msg.sender;

        // Mint 1 billion tokens (18 decimals) to the agent
        _mint(msg.sender, 1_000_000_000 * 10**18);

        emit TrendTokenDeployed(_trendTopic, _trendRegion, msg.sender);
    }
}

