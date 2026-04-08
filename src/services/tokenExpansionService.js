const hre = require("hardhat");
const logger = require('../utils/logger');

// AgentControlledToken ABI for expansion operations
const TOKEN_ABI = [
    "function dexContract() external view returns (address)",
    "function agentMint(uint256 amount) external",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function totalAgentMinted() external view returns (uint256)"
];

// BondingCurveDEX ABI
const DEX_ABI = [
    "function addLiquidity(uint256 tokenAmount) external payable",
    "function withdrawFees(address payable recipient) external",
    "function getPoolInfo() external view returns (uint256 tokenReserve, uint256 ethReserve, uint256 k, uint256 swapFeeBps, uint256 totalFeesCollected, uint256 price)"
];

/**
 * Service for expanding token supply and liquidity based on trend performance
 */
class TokenExpansionService {
    constructor(signer) {
        this.signer = signer;
    }

    /**
     * Mint new tokens via agentMint and add them as liquidity
     * @param {string} tokenAddress - Token contract address
     * @param {string} amount - Amount to mint (in ether units)
     * @param {string} ethToAdd - ETH to pair with new tokens (in ether units)
     */
    async expandSupply(tokenAddress, amount, ethToAdd = "0") {
        logger.info(`🚀 Expanding supply for ${tokenAddress}: ${amount} tokens + ${ethToAdd} ETH`);

        const token = new hre.ethers.Contract(tokenAddress, TOKEN_ABI, this.signer);
        const dexAddress = await token.dexContract();
        const dex = new hre.ethers.Contract(dexAddress, DEX_ABI, this.signer);

        const amountWei = hre.ethers.parseUnits(amount.toString(), 18);
        const ethWei = hre.ethers.parseEther(ethToAdd.toString());

        // 1. Mint new tokens to deployer
        logger.info(`Minting ${amount} tokens via agentMint...`);
        const mintTx = await token.agentMint(amountWei, {
            maxPriorityFeePerGas: hre.ethers.parseUnits("0.1", "gwei"),
            maxFeePerGas: hre.ethers.parseUnits("2", "gwei")
        });
        await mintTx.wait();
        logger.info(`✅ Minted: ${mintTx.hash}`);

        // 2. Approve DEX to spend new tokens
        logger.info(`Approving DEX to spend new tokens...`);
        const approveTx = await token.approve(dexAddress, amountWei, {
            maxPriorityFeePerGas: hre.ethers.parseUnits("0.1", "gwei"),
            maxFeePerGas: hre.ethers.parseUnits("2", "gwei")
        });
        await approveTx.wait();
        logger.info(`✅ Approved: ${approveTx.hash}`);

        // 3. Add liquidity if ETH provided
        let liquidityTx = null;
        if (ethToAdd > 0) {
            logger.info(`Adding liquidity with new tokens...`);
            const addTx = await dex.addLiquidity(amountWei, {
                value: ethWei,
                maxPriorityFeePerGas: hre.ethers.parseUnits("0.1", "gwei"),
                maxFeePerGas: hre.ethers.parseUnits("2", "gwei")
            });
            await addTx.wait();
            logger.info(`✅ Liquidity added: ${addTx.hash}`);
            liquidityTx = addTx.hash;
        }

        // 4. Get updated state
        const totalMinted = await token.totalAgentMinted();
        const poolInfo = await dex.getPoolInfo();

        return {
            success: true,
            mintTx: mintTx.hash,
            liquidityTx,
            totalAgentMinted: hre.ethers.formatUnits(totalMinted, 18),
            tokenReserve: hre.ethers.formatUnits(poolInfo.tokenReserve, 18),
            ethReserve: hre.ethers.formatEther(poolInfo.ethReserve),
            currentPrice: hre.ethers.formatUnits(poolInfo.price, 18)
        };
    }

    /**
     * Get current token and pool state for AI decision making
     * @param {string} tokenAddress - Token contract address
     */
    async getTokenState(tokenAddress) {
        const token = new hre.ethers.Contract(tokenAddress, TOKEN_ABI, this.signer);
        const dexAddress = await token.dexContract();
        const dex = new hre.ethers.Contract(dexAddress, DEX_ABI, this.signer);

        const [totalMinted, poolInfo] = await Promise.all([
            token.totalAgentMinted(),
            dex.getPoolInfo()
        ]);

        return {
            tokenAddress,
            dexAddress,
            totalAgentMinted: hre.ethers.formatUnits(totalMinted, 18),
            tokenReserve: hre.ethers.formatUnits(poolInfo.tokenReserve, 18),
            ethReserve: hre.ethers.formatEther(poolInfo.ethReserve),
            swapFeeBps: poolInfo.swapFeeBps.toString(),
            totalFeesCollected: hre.ethers.formatEther(poolInfo.totalFeesCollected),
            currentPrice: hre.ethers.formatUnits(poolInfo.price, 18)
        };
    }

    /**
     * Withdraw accumulated fees to a recipient (daily trigger)
     * @param {string} tokenAddress - Token contract address
     * @param {string} recipient - Address to receive fees
     * @param {string} minThreshold - Minimum fee amount to trigger withdrawal (in ETH)
     */
    async withdrawFees(tokenAddress, recipient, minThreshold = "0.01") {
        logger.info(`💰 Checking fees for withdrawal: ${tokenAddress}`);

        const token = new hre.ethers.Contract(tokenAddress, TOKEN_ABI, this.signer);
        const dexAddress = await token.dexContract();
        const dex = new hre.ethers.Contract(dexAddress, DEX_ABI, this.signer);

        // Check accumulated fees
        const poolInfo = await dex.getPoolInfo();
        const feesCollected = hre.ethers.formatEther(poolInfo.totalFeesCollected);
        
        logger.info(`Current fees: ${feesCollected} ETH (threshold: ${minThreshold} ETH)`);

        // Only withdraw if above threshold
        if (parseFloat(feesCollected) < parseFloat(minThreshold)) {
            logger.info(`⏭️ Fees below threshold, skipping withdrawal`);
            return { success: false, reason: "Below threshold", feesCollected };
        }

        // Withdraw fees to recipient
        logger.info(`Withdrawing ${feesCollected} ETH to ${recipient}...`);
        const tx = await dex.withdrawFees(recipient, {
            maxPriorityFeePerGas: hre.ethers.parseUnits("0.1", "gwei"),
            maxFeePerGas: hre.ethers.parseUnits("2", "gwei")
        });
        await tx.wait();
        logger.info(`✅ Fees withdrawn: ${tx.hash}`);

        return {
            success: true,
            txHash: tx.hash,
            amount: feesCollected,
            recipient
        };
    }
}

module.exports = TokenExpansionService;
