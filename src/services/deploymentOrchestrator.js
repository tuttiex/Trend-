const hre = require("hardhat");
const LiquidityManager = require('./liquidityManager');
const TweetApiCom = require('../services/tweetApiCom'); // Class Capitalized
const imageGenerator = require('./imageGenerator');
const ipfsUploader = require('./ipfsUploader');
const tokenRegistryService = require('./tokenRegistryService');
const logger = require('../utils/logger');

class DeploymentOrchestrator {
    constructor(signer) {
        this.signer = signer;
        this.liquidityManager = new LiquidityManager(hre.ethers.provider, signer);
        this.twitter = new TweetApiCom();
    }

    /**
     * Executes the full deployment pipeline with Virtuals-style image handling.
     * @param {Object} plan - The deployment plan from the Planner/ContentModerator
     */
    async executeDeployment(plan) {
        logger.info(`🚀 STARTING VIRTUALS-STYLE DEPLOYMENT for ${plan.topic} ($${plan.symbol})`);

        // Initialize liquidity manager for the current network
        await this.liquidityManager.init();

        let tokenAddress = plan.existingToken;
        let metadataCid = plan.metadataCid;
        let txHash;
        let poolAddress;
        let imageCid; // declared here so it's accessible on the resume path AND if image generation returns null

        try {
            if (!tokenAddress) {
                // 1. Generate & Upload Image Metadata (Parallel or sequential)
                try {
                    logger.info("🎨 Orchestrator: Generating Virtuals-style Logo...");
                    const imageBuffer = await imageGenerator.generateTokenLogo(plan.topic, plan.symbol, plan.region);

                    if (imageBuffer) {
                        imageCid = await ipfsUploader.uploadImage(imageBuffer, plan.symbol);
                        const gatewayBase = "https://gateway.pinata.cloud/ipfs/";

                        const metadata = {
                            name: `${plan.topic} Token`,
                            symbol: plan.symbol,
                            description: `Deployed by Trends Agent. Identity registered on-chain via MetadataRegistry. Trend: ${plan.topic} in ${plan.region}.`,
                            image: `${gatewayBase}${imageCid}?filename=${plan.symbol}.png`,
                            external_url: `https://basescan.org/token/`,
                            attributes: [
                                { trait_type: "Region", value: plan.region },
                                { trait_type: "Trend", value: plan.topic }
                            ]
                        };
                        metadataCid = await ipfsUploader.uploadMetadata(metadata);
                    }
                } catch (imgError) {
                    logger.error(`⚠️ Image Gen/Upload Failed: ${imgError.message}. Proceeding without metadata.`);
                }

                // 2. Deploy Standard Token (Old Contract Style)
                logger.info(`Orchestrator: Deploying standard token ${plan.symbol} for trend "${plan.topic}"...`);
                const TrendToken = await hre.ethers.getContractFactory("TrendToken", this.signer);
                const tokenName = `${plan.topic} Token`;

                const initialSupplyWei = hre.ethers.parseUnits(plan.initialLiquidityTokens.toString(), 18);

                const token = await TrendToken.deploy(
                    tokenName,
                    plan.symbol,
                    plan.topic,
                    plan.region,
                    initialSupplyWei,
                    {
                        maxPriorityFeePerGas: hre.ethers.parseUnits("0.1", "gwei"), // Mainnet friendly
                        maxFeePerGas: hre.ethers.parseUnits("2", "gwei")
                    }
                );
                await token.waitForDeployment();
                tokenAddress = await token.getAddress();
                logger.info(`✅ Token Deployed at: ${tokenAddress}`);

                // 3. Register Metadata On-Chain (Virtuals-style)
                if (metadataCid) {
                    try {
                        logger.info(`Orchestrator: Registering metadata CID ${metadataCid} for token ${tokenAddress}...`);
                        await tokenRegistryService.registerTokenMetadata(
                            tokenAddress,
                            metadataCid,
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
            }

            // 4. Create & Initialize Pool
            logger.info("Step 2: Creating Uniswap V3 Pool...");
            poolAddress = await this.liquidityManager.getOrCreatePool(tokenAddress, 3000);

            // 5. Prepare Liquidity Amounts
            const amountTokens = plan.initialLiquidityTokens || "100000000";
            const amountETH = plan.initialLiquidityETH || "0.0004";

            // 6. Calculate Initial Price
            const initialPrice = (parseFloat(amountETH) / parseFloat(amountTokens)).toFixed(18);
            logger.info(`Calculated Initial Price: ${initialPrice} ETH per Token`);

            // 7. Initialize Pool
            await this.liquidityManager.initializePool(tokenAddress, poolAddress, initialPrice);

            // 8. Add Liquidity
            logger.info("Step 3: Adding Initial Liquidity...");
            txHash = await this.liquidityManager.addLiquidity(
                tokenAddress,
                amountTokens,
                amountETH
            );
            logger.info(`✅ Liquidity Added. Tx: ${txHash}`);

            // 9. Announce on X
            logger.info("Step 4: Preparing Announcement for X...");
            const tweetDelay = Math.floor(Math.random() * (60 - 10 + 1) + 10);
            logger.info(`Waiting ${tweetDelay}s before posting to X...`);
            await new Promise(resolve => setTimeout(resolve, tweetDelay * 1000));

            let tweetText = plan.tweetContent;
            if (!tweetText || !tweetText.includes('{{CONTRACT}}')) {
                tweetText = `🚀 New Trend Detected: {{TREND}}!\n\nDeployed {{SYMBOL}} on Base.\nCA: {{CONTRACT}}\n\n#Base #{{SYMBOL}} #{{REGION}}`;
            }

            const regionTag = plan.region || "World";
            tweetText = tweetText
                .replace(/{{TREND}}/g, plan.topic)
                .replace(/{{SYMBOL}}/g, plan.symbol)
                .replace(/{{CONTRACT}}/g, tokenAddress)
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
                metadataCid,
                imageCid: plan.imageCid || imageCid,
                poolAddress,
                liquidityTx: txHash
            };

        } catch (error) {
            logger.error(`❌ Deployment Orchestration Failed: ${error.message}`);
            error.tokenAddress = tokenAddress;
            error.metadataCid = metadataCid;
            error.poolAddress = poolAddress;
            error.txHash = txHash;
            throw error;
        }
    }
}

module.exports = DeploymentOrchestrator;

