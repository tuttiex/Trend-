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
        string memory _trendRegion,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(name).length <= 50, "Name exceeds 50 characters");
        
        require(bytes(symbol).length > 0, "Symbol cannot be empty");
        require(bytes(symbol).length <= 15, "Symbol exceeds 15 characters");
        
        require(bytes(_trendTopic).length > 0, "Trend topic cannot be empty");
        require(bytes(_trendTopic).length <= 100, "Trend topic exceeds 100 characters");
        
        require(bytes(_trendRegion).length > 0, "Trend region cannot be empty");
        require(bytes(_trendRegion).length <= 50, "Trend region exceeds 50 characters");

        trendTopic = _trendTopic;
        trendRegion = _trendRegion;
        deployerAgent = msg.sender;

        // Mint initial tokens based on formula to the agent
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }

        emit TrendTokenDeployed(_trendTopic, _trendRegion, msg.sender);
    }

    /**
     * @notice Mint new tokens dynamically due to increased trend momentum.
     * @param amount The number of tokens (in wei) to mint.
     */
    function agentMint(uint256 amount) external {
        require(msg.sender == deployerAgent, "Only the deployer agent can mint tokens");
        require(amount > 0, "Amount must be greater than zero");
        _mint(msg.sender, amount);
    }
}

