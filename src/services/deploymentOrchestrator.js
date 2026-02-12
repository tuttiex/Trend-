const hre = require("hardhat");
const LiquidityManager = require('./liquidityManager');
const TweetApiCom = require('./tweetApiCom');
const logger = require('../utils/logger');

class DeploymentOrchestrator {
    constructor(signer) {
        this.signer = signer;
        this.liquidityManager = new LiquidityManager(hre.ethers.provider, signer);
        this.twitter = new TweetApiCom();
    }

    /**
     * Executes the full deployment pipeline for a trending topic.
     * @param {Object} plan - The deployment plan from the Planner/ContentModerator
     * @param {string} plan.topic - "Cole Palmer"
     * @param {string} plan.symbol - "CLPL"
     * @param {string} plan.region - "Nigeria"
     * @param {string} plan.initialLiquidityETH - "0.01"
     * @param {string} plan.initialLiquidityTokens - "300000"
     */
    async executeDeployment(plan) {
        logger.info(`🚀 STARTING DEPLOYMENT ORCHESTRATION for ${plan.topic} ($${plan.symbol})`);

        try {
            // 1. Deploy Token
            logger.info("Step 1: Deploying Token Contract...");
            const TrendToken = await hre.ethers.getContractFactory("TrendToken", this.signer);
            const tokenName = `${plan.topic} Token`;

            const token = await TrendToken.deploy(
                tokenName,
                plan.symbol,
                plan.topic,
                plan.region
            );
            await token.waitForDeployment();
            const tokenAddress = await token.getAddress();
            logger.info(`✅ Token Deployed at: ${tokenAddress}`);

            // 2. Create & Initialize Pool
            logger.info("Step 2: Creating Uniswap V3 Pool...");
            // Default fee 3000 (0.3%)
            const poolAddress = await this.liquidityManager.getOrCreatePool(tokenAddress, 3000);

            // 3. Prepare Liquidity Amounts
            // Calculate 20% of 1B supply if not specified (200,000,000)
            // Or use the plan input.
            const amountTokens = plan.initialLiquidityTokens || "200000000";
            const amountETH = plan.initialLiquidityETH || "0.01";

            // 4. Calculate Initial Price (ETH per Token)
            // Price = ETH / Tokens
            // e.g. 0.01 / 200,000,000 = 5e-11 ETH per Token
            // 1B Market Cap = 0.05 ETH (~$150) -> Fair Launch
            const initialPrice = (parseFloat(amountETH) / parseFloat(amountTokens)).toFixed(18);
            logger.info(`Calculated Initial Price: ${initialPrice} ETH per Token`);

            // 5. Initialize Pool
            await this.liquidityManager.initializePool(tokenAddress, poolAddress, initialPrice);

            // 6. Add Liquidity
            logger.info("Step 3: Adding Initial Liquidity...");
            const txHash = await this.liquidityManager.addLiquidity(
                tokenAddress,
                amountTokens,
                amountETH
            );
            logger.info(`✅ Liquidity Added. Tx: ${txHash}`);

            // 4. Verify/Post (Optional: Verify on Basescan programmatically via API? Skip for now.)

            // 5. Announce on X
            // 5. Announce on X
            logger.info("Step 4: Posting Announcement to X...");

            let tweetText = plan.tweetContent;

            // Fallback if AI didn't provide a tweet or it's malformed
            if (!tweetText || !tweetText.includes('{{CONTRACT}}')) {
                logger.warn("Pipeline: AI did not provide a valid tweet. Using fallback template.");
                tweetText = `🚀 New Trend Detected: ${plan.topic}!\n\n` +
                    `Deployed $${plan.symbol} on Base.\n` +
                    `Contract: {{CONTRACT}}\n\n` +
                    `#Base #Crypto #${plan.symbol}`;
            }

            // Replace placeholders
            tweetText = tweetText
                .replace('{{TREND}}', plan.topic)
                .replace('{{SYMBOL}}', plan.symbol)
                .replace('{{CONTRACT}}', tokenAddress);

            logger.info(`Generated Tweet: \n${tweetText}`);

            // We use safePost which handles error logging internaly

            try {
                await this.twitter.postTweet(tweetText);
                logger.info("✅ Tweet posted successfully (Orchestrator).");
            } catch (tweetError) {
                // If the tweet fails, DO NOT fail the deployment. It's done.
                logger.warn(`Tweet failed, but deployment succeeded: ${tweetError.message}`);
                // Proceed as success
            }

            return {
                success: true,
                success: true,
                tokenAddress,
                poolAddress,
                liquidityTx: txHash
            };

        } catch (error) {
            logger.error(`❌ Deployment Orchestration Failed: ${error.message}`);
            // TODO: Implement rollback or cleanup logic if possible (burn tokens?)
            throw error;
        }
    }
}

module.exports = DeploymentOrchestrator;
