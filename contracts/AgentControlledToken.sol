// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./BondingCurveDEX.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentControlledToken
 * @notice ERC20 token with controlled minting. Only the BondingCurveDEX and deployer can mint.
 *         Designed to work exclusively with BondingCurveDEX for full agent control.
 */
contract AgentControlledToken is ERC20, Ownable {
    string public trendTopic;
    string public trendRegion;
    address public immutable deployerAgent;
    address public dexContract;
    
    // Track total minted via agent
    uint256 public totalAgentMinted;
    
    // DEX migration timelock (C-1: timestamps, not blocks)
    uint256 public constant DEX_MIGRATION_DELAY = 48 hours;
    address public pendingDexContract;
    uint256 public dexMigrationTimestamp;
    
    // Events
    event TrendTokenDeployed(
        string topic,
        string region,
        address indexed deployer,
        address indexed dexContract
    );
    event AgentMinted(address recipient, uint256 amount, uint256 newTotal);
    event DexContractUpdated(address newDexContract);
    event DexMigrationScheduled(address newDex, uint256 effectiveTimestamp);
    event DexMigrationCancelled(address cancelledDex);

    /**
     * @notice Deploy token and create its exclusive DEX
     * @dev String limits are in bytes, not characters. Max 50 bytes for name, 15 for symbol.
     * @param name Token name (max 50 bytes)
     * @param symbol Token symbol (max 15 bytes)
     * @param _trendTopic The trend topic
     * @param _trendRegion The trend region
     * @param initialSupply Initial token supply (goes to deployer, then to DEX)
     * @param _swapFeeBps DEX swap fee in basis points (e.g., 70 = 0.7%)
     */
    constructor(
        string memory name,
        string memory symbol,
        string memory _trendTopic,
        string memory _trendRegion,
        uint256 initialSupply,
        uint256 _swapFeeBps
    ) ERC20(name, symbol) Ownable(msg.sender) {
        // String validation - limits in bytes, not characters (M-2)
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(name).length <= 50, "Name exceeds 50 bytes");
        
        require(bytes(symbol).length > 0, "Symbol cannot be empty");
        require(bytes(symbol).length <= 15, "Symbol exceeds 15 bytes");
        
        require(bytes(_trendTopic).length > 0, "Trend topic cannot be empty");
        require(bytes(_trendTopic).length <= 100, "Trend topic exceeds 100 bytes");
        
        require(bytes(_trendRegion).length > 0, "Trend region cannot be empty");
        require(bytes(_trendRegion).length <= 50, "Trend region exceeds 50 bytes");

        trendTopic = _trendTopic;
        trendRegion = _trendRegion;
        deployerAgent = msg.sender;

        // Deploy the BondingCurveDEX for this token
        // Using inline deployment to ensure exclusive pairing
        dexContract = address(new BondingCurveDEX(address(this), _swapFeeBps));
        
        // Transfer ownership of DEX to deployer
        BondingCurveDEX(dexContract).transferOwnership(msg.sender);

        // Mint initial supply to deployer
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }

        emit TrendTokenDeployed(_trendTopic, _trendRegion, msg.sender, dexContract);
    }

    /**
     * @notice Agent-controlled mint for special cases (fallback)
     * @param amount Amount to mint
     * @param recipient Address to receive the minted tokens
     */
    function agentMint(uint256 amount, address recipient) external onlyOwner {
        require(amount > 0, "Amount must be greater than zero");
        require(recipient != address(0), "Zero address recipient");
        _mint(recipient, amount);
        totalAgentMinted += amount;
        emit AgentMinted(recipient, amount, totalAgentMinted);
    }

    /**
     * @notice Schedule a DEX migration with timelock (C-1)
     * @param newDexContract New DEX address
     */
    function scheduleDexMigration(address newDexContract) external onlyOwner {
        require(newDexContract != address(0), "Invalid DEX address");
        require(dexMigrationTimestamp == 0, "Migration already pending");
        
        pendingDexContract = newDexContract;
        dexMigrationTimestamp = block.timestamp + DEX_MIGRATION_DELAY;
        emit DexMigrationScheduled(newDexContract, dexMigrationTimestamp);
    }

    /**
     * @notice Apply scheduled DEX migration after timelock expires
     */
    function applyDexMigration() external onlyOwner {
        require(dexMigrationTimestamp != 0, "No pending migration");
        require(block.timestamp >= dexMigrationTimestamp, "Timelock not expired");
        
        dexContract = pendingDexContract;
        pendingDexContract = address(0);
        dexMigrationTimestamp = 0;
        
        emit DexContractUpdated(dexContract);
    }

    /**
     * @notice Cancel a pending DEX migration
     */
    function cancelDexMigration() external onlyOwner {
        require(dexMigrationTimestamp != 0, "No pending migration");
        
        address cancelled = pendingDexContract;
        pendingDexContract = address(0);
        dexMigrationTimestamp = 0;
        
        emit DexMigrationCancelled(cancelled);
    }

    /**
     * @notice Get DEX pool info
     * @return All pool metrics
     */
    function getDexInfo() external view returns (
        address,
        uint256 tokenReserve,
        uint256 ethReserve,
        uint256 price,
        uint256 swapFeeBps,
        uint256 totalFeesCollected
    ) {
        BondingCurveDEX dex = BondingCurveDEX(dexContract);
        (
            tokenReserve,
            ethReserve,
            ,
            swapFeeBps,
            totalFeesCollected,
            price
        ) = dex.getPoolInfo();
        
        return (
            dexContract,
            tokenReserve,
            ethReserve,
            price,
            swapFeeBps,
            totalFeesCollected
        );
    }

    /**
     * @notice Get complete token info
     */
    function getTokenInfo() external view returns (
        string memory _topic,
        string memory _region,
        address _deployer,
        address _dex,
        uint256 _totalSupply,
        uint256 _totalAgentMinted
    ) {
        return (
            trendTopic,
            trendRegion,
            deployerAgent,
            dexContract,
            totalSupply(),
            totalAgentMinted
        );
    }
}
