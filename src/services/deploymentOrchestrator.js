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
            const amountETH = plan.initialLiquidityETH || "0.0004";

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
            logger.info("Step 4: Preparing Announcement for X...");

            // Human-like delay: wait 30-120 seconds before posting to avoid anti-bot flags
            const tweetDelay = Math.floor(Math.random() * (120 - 30 + 1) + 30);
            logger.info(`Waiting ${tweetDelay}s before posting to X for better human-mimicry...`);
            await new Promise(resolve => setTimeout(resolve, tweetDelay * 1000));

            let tweetText = plan.tweetContent;

            // Fallback templates for variety (Anti-Spam)
            const fallbackTemplates = [
                `🚀 New Trend Detected in {{REGION}}: {{TREND}}!\n\nDeployed ${{ SYMBOL }} on Base.\nContract: {{CONTRACT}}\n\n#Base #Crypto #{{SYMBOL}} #{{REGION}}`,
                `🔥 JUST IN: {{TREND}} is sweeping {{REGION}}! \n\nWe launched ${{ SYMBOL }} on Base to capture the signal. \nAddress: {{CONTRACT}}\n\n#BaseEcosystem #{{SYMBOL}} #{{REGION}}`,
                `📈 Social Signal Alert! {{TREND}} is viral in {{REGION}} right now.\n\nCaptured via ${{ SYMBOL }} on Base.\nCA: {{CONTRACT}}\n\n#Base #MemeCoin #{{SYMBOL}} #{{REGION}}`,
                `🎯 The data is clear: {{TREND}} is the top move in {{REGION}}.\n\nGet in early on ${{ SYMBOL }} (Base).\nContract: {{CONTRACT}}\n\n#Trending #{{SYMBOL}} #{{REGION}}`
            ];

            // If AI didn't provide a tweet or it's malformed, pick a random fallback
            if (!tweetText || !tweetText.includes('{{CONTRACT}}')) {
                logger.warn("Pipeline: AI did not provide a valid tweet. Using randomized fallback.");
                tweetText = fallbackTemplates[Math.floor(Math.random() * fallbackTemplates.length)];
            }

            // --- CACHE BUSTER (Anti-403 Logic) ---
            // Add random emojis to ensure every tweet is unique even if the template repeats
            const emojis = ['🚀', '🔥', '📈', '💎', '🟢', '📣', '🚨', '📢', '🎯', '✨', '⚡'];
            const randomEmojis = Array(3).fill(0).map(() => emojis[Math.floor(Math.random() * emojis.length)]).join(' ');
            tweetText = `${randomEmojis}\n\n${tweetText}\n\n${randomEmojis}`;

            // Replace placeholders (Safety: ensure region is present)
            const regionTag = plan.region || "World";
            tweetText = tweetText
                .replace(/{{TREND}}/g, plan.topic)
                .replace(/{{SYMBOL}}/g, plan.symbol)
                .replace(/{{CONTRACT}}/g, tokenAddress)
                .replace(/{{REGION}}/g, regionTag);

            logger.info(`Generated Tweet: \n${tweetText}`);

            try {
                await this.twitter.postTweet(tweetText);
                logger.info("✅ Tweet posted successfully (Orchestrator).");
            } catch (tweetError) {
                logger.warn(`Tweet failed, but deployment succeeded: ${tweetError.message}`);
            }

            return {
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
