const hre = require("hardhat");
const TweetApiCom = require('../services/tweetApiCom');
const imageGenerator = require('./imageGenerator');
const r2Uploader = require('./r2Uploader');
const tokenRegistryService = require('./tokenRegistryService');
const logger = require('../utils/logger');

// BondingCurveDEX ABI (minimal for liquidity operations)
const BONDING_CURVE_DEX_ABI = [
    "function addLiquidity(uint256 tokenAmount) external payable",
    "function getPoolInfo() external view returns (uint256 tokenReserve, uint256 ethReserve, uint256 k, uint256 swapFeeBps, uint256 totalFeesCollected, uint256 price)",
    "function token() external view returns (address)"
];

// AgentControlledToken ABI (minimal for deployment and liquidity)
const AGENT_CONTROLLED_TOKEN_ABI = [
    "function dexContract() external view returns (address)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)"
];

class DeploymentOrchestrator {
    constructor(signer) {
        this.signer = signer;
        this.twitter = new TweetApiCom();
    }

    /**
     * Executes the full deployment pipeline with Virtuals-style image handling.
     * @param {Object} plan - The deployment plan from the Planner/ContentModerator
     */
    async executeDeployment(plan) {
        logger.info(`🚀 STARTING BONDING CURVE DEPLOYMENT for ${plan.topic} ($${plan.symbol})`);

        let tokenAddress = plan.existingToken;
        let dexAddress = plan.existingDex;
        let metadataUrl = plan.metadataUrl;
        let txHash;
        let imageUrl;

        try {
            if (!tokenAddress) {
                // 1. Generate & Upload Image Metadata
                try {
                    logger.info("🎨 Orchestrator: Generating Token Logo...");
                    // Use LLM-enhanced prompts for semantic trend context
                    const useEnhancedPrompt = true;
                    const imageBuffer = await imageGenerator.generateTokenLogo(plan.topic, plan.symbol, plan.region, useEnhancedPrompt);

                    if (imageBuffer) {
                        imageUrl = await r2Uploader.uploadImage(imageBuffer, plan.symbol);

                        const metadata = {
                            name: `${plan.topic} Token`,
                            symbol: plan.symbol,
                            description: `Deployed by Trends Agent. Bonding Curve DEX with 0.7% swap fee. Trend: ${plan.topic} in ${plan.region}.`,
                            image: imageUrl,
                            external_url: `https://basescan.org/token/`,
                            attributes: [
                                { trait_type: "Region", value: plan.region },
                                { trait_type: "Trend", value: plan.topic },
                                { trait_type: "DEX Type", value: "Bonding Curve" }
                            ]
                        };
                        metadataUrl = await r2Uploader.uploadMetadata(metadata);
                    }
                } catch (imgError) {
                    logger.error(`⚠️ Image Gen/Upload Failed: ${imgError.message}. Proceeding without metadata.`);
                }

                // 2. Deploy AgentControlledToken with inline BondingCurveDEX
                logger.info(`Orchestrator: Deploying AgentControlledToken ${plan.symbol} for trend "${plan.topic}"...`);
                const AgentControlledToken = await hre.ethers.getContractFactory("AgentControlledToken", this.signer);
                const tokenName = `${plan.topic} Token`;

                const initialSupplyWei = hre.ethers.parseUnits(plan.initialLiquidityTokens.toString(), 18);
                const swapFeeBps = plan.swapFeeBps || 70; // Default 0.7%

                const token = await AgentControlledToken.deploy(
                    tokenName,
                    plan.symbol,
                    plan.topic,
                    plan.region,
                    initialSupplyWei,
                    swapFeeBps,
                    {
                        maxPriorityFeePerGas: hre.ethers.parseUnits("0.1", "gwei"),
                        maxFeePerGas: hre.ethers.parseUnits("2", "gwei")
                    }
                );
                await token.waitForDeployment();
                tokenAddress = await token.getAddress();
                dexAddress = await token.dexContract();
                
                logger.info(`✅ Token Deployed at: ${tokenAddress}`);
                logger.info(`✅ BondingCurveDEX Deployed at: ${dexAddress}`);

                // 3. Seed Initial Liquidity
                logger.info("Step 3: Seeding Initial Liquidity to BondingCurveDEX...");
                const amountTokens = plan.initialLiquidityTokens || "100000000";
                const amountETH = plan.initialLiquidityETH || "0.0004";
                
                txHash = await this._seedLiquidity(
                    tokenAddress,
                    dexAddress,
                    amountTokens,
                    amountETH
                );
                logger.info(`✅ Liquidity Seeded. Tx: ${txHash}`);

                // 4. Register Metadata On-Chain
                if (metadataUrl) {
                    try {
                        logger.info(`Orchestrator: Registering metadata URL ${metadataUrl} for token ${tokenAddress}...`);
                        await tokenRegistryService.registerTokenMetadata(
                            tokenAddress,
                            metadataUrl,
                            this.signer,
                            {
                                maxPriorityFeePerGas: hre.ethers.parseUnits("0.2", "gwei")
                            }
                        );
                    } catch (regError) {
                        logger.error(`⚠️ Metadata Registration Failed: ${regError.message}`);
                    }
                }
            } else {
                logger.info(`Orchestrator: Resuming deployment for existing token: ${tokenAddress}`);
                if (!dexAddress) {
                    const token = new hre.ethers.Contract(tokenAddress, AGENT_CONTROLLED_TOKEN_ABI, this.signer);
                    dexAddress = await token.dexContract();
                }
            }

            // 5. Announce on X
            logger.info("Step 4: Preparing Announcement for X...");
            const tweetDelay = Math.floor(Math.random() * (60 - 10 + 1) + 10);
            logger.info(`Waiting ${tweetDelay}s before posting to X...`);
            await new Promise(resolve => setTimeout(resolve, tweetDelay * 1000));

            let tweetText = plan.tweetContent;
            if (!tweetText || !tweetText.includes('{{CONTRACT}}')) {
                tweetText = `🚀 New Trend Detected: {{TREND}}!

Deployed {{SYMBOL}} on Base.
CA: {{CONTRACT}}
DEX: {{DEX}}`;
            }

            const regionTag = plan.region || "World";
            tweetText = tweetText
                .replace(/{{TREND}}/g, plan.topic)
                .replace(/{{SYMBOL}}/g, plan.symbol)
                .replace(/{{CONTRACT}}/g, tokenAddress)
                .replace(/{{DEX}}/g, dexAddress)
                .replace(/{{REGION}}/g, regionTag);

            try {
                await this.twitter.postTweet(tweetText);
                logger.info("✅ Tweet posted successfully.");
            } catch (tweetError) {
                logger.warn(`Tweet failed: ${tweetError.message}`);
            }

            return {
                success: true,
                tokenAddress,
                dexAddress,
                metadataUrl,
                imageUrl: plan.imageUrl || imageUrl,
                liquidityTx: txHash
            };

        } catch (error) {
            logger.error(`❌ Deployment Orchestration Failed: ${error.message}`);
            error.tokenAddress = tokenAddress;
            error.dexAddress = dexAddress;
            error.metadataUrl = metadataUrl;
            error.txHash = txHash;
            throw error;
        }
    }

    /**
     * Seeds initial liquidity to the BondingCurveDEX
     * @param {string} tokenAddress - Token contract address
     * @param {string} dexAddress - DEX contract address
     * @param {string} amountTokens - Token amount (in ether units)
     * @param {string} amountETH - ETH amount (in ether units)
     */
    async _seedLiquidity(tokenAddress, dexAddress, amountTokens, amountETH) {
        logger.info(`Seeding liquidity: ${amountTokens} tokens + ${amountETH} ETH`);

        // Create contract instances
        const token = new hre.ethers.Contract(tokenAddress, AGENT_CONTROLLED_TOKEN_ABI, this.signer);
        const dex = new hre.ethers.Contract(dexAddress, BONDING_CURVE_DEX_ABI, this.signer);

        // Convert amounts
        const tokenAmountWei = hre.ethers.parseUnits(amountTokens.toString(), 18);
        const ethAmountWei = hre.ethers.parseEther(amountETH.toString());

        // Check token balance
        const deployerAddress = await this.signer.getAddress();
        const balance = await token.balanceOf(deployerAddress);
        logger.info(`Deployer token balance: ${hre.ethers.formatUnits(balance, 18)}`);

        if (balance < tokenAmountWei) {
            throw new Error(`Insufficient token balance. Have: ${balance}, Need: ${tokenAmountWei}`);
        }

        // Approve DEX to spend tokens
        logger.info(`Approving DEX to spend ${amountTokens} tokens...`);
        const approveTx = await token.approve(dexAddress, tokenAmountWei, {
            maxPriorityFeePerGas: hre.ethers.parseUnits("0.1", "gwei"),
            maxFeePerGas: hre.ethers.parseUnits("2", "gwei")
        });
        await approveTx.wait();
        logger.info(`✅ Approval confirmed: ${approveTx.hash}`);

        // Add liquidity to DEX
        logger.info(`Adding liquidity to DEX...`);
        const addLiquidityTx = await dex.addLiquidity(tokenAmountWei, {
            value: ethAmountWei,
            maxPriorityFeePerGas: hre.ethers.parseUnits("0.1", "gwei"),
            maxFeePerGas: hre.ethers.parseUnits("2", "gwei")
        });
        await addLiquidityTx.wait();
        logger.info(`✅ Liquidity added: ${addLiquidityTx.hash}`);

        // Verify pool state
        const poolInfo = await dex.getPoolInfo();
        logger.info(`Pool initialized - Token Reserve: ${hre.ethers.formatUnits(poolInfo.tokenReserve, 18)}, ETH Reserve: ${hre.ethers.formatEther(poolInfo.ethReserve)}`);

        return addLiquidityTx.hash;
    }

    /**
     * Adds additional liquidity to an existing token's DEX (for AI expansion)
     * @param {string} tokenAddress - Token contract address
     * @param {string} amountTokens - Additional token amount
     * @param {string} amountETH - Additional ETH amount
     */
    async expandLiquidity(tokenAddress, amountTokens, amountETH) {
        logger.info(`Expanding liquidity for ${tokenAddress}`);

        const token = new hre.ethers.Contract(tokenAddress, AGENT_CONTROLLED_TOKEN_ABI, this.signer);
        const dexAddress = await token.dexContract();

        return await this._seedLiquidity(tokenAddress, dexAddress, amountTokens, amountETH);
    }
}

module.exports = DeploymentOrchestrator;

