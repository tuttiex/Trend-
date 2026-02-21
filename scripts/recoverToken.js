/**
 * Recovery script: generates a logo, pushes to website, and tweets for
 * a token that was deployed on-chain but never had its post-deployment
 * steps completed (image, webhook, tweet).
 * 
 * Usage: node scripts/recoverToken.js
 */

const imageGenerator = require('../src/services/imageGenerator');
const ipfsUploader = require('../src/services/ipfsUploader');
const webhookService = require('../src/services/webhookService');
const TweetApiCom = require('../src/services/tweetApiCom');
const logger = require('../src/utils/logger');
require('dotenv').config();

// ── TOKEN TO RECOVER ──────────────────────────────────────────────
const TOKEN = {
    topic: "Xbox",
    symbol: "XBOX",
    region: "United States",
    tokenAddress: "0xCEAb6b1FdcB9f2bbCb9A59043ce0E34140c0C2E5",
    poolAddress: "0x94B63eC03ae89c226E3ba98AfF66F290a5b4B459",
    liquidityTx: null // tx hash if known, else null
};
// ─────────────────────────────────────────────────────────────────

async function recoverToken() {
    logger.info(`🔧 Starting recovery for ${TOKEN.topic} ($${TOKEN.symbol})...`);

    // Step 1: Generate logo
    let imageCid = null;
    try {
        logger.info("🎨 Generating logo...");
        const imageBuffer = await imageGenerator.generateTokenLogo(TOKEN.topic, TOKEN.symbol, TOKEN.region);
        if (imageBuffer) {
            imageCid = await ipfsUploader.uploadImage(imageBuffer, TOKEN.symbol);
            logger.info(`✅ Logo uploaded! CID: ${imageCid}`);
        }
    } catch (err) {
        logger.error(`❌ Image generation failed: ${err.message}. Will push without image.`);
    }

    // Step 2: Push to website webhook
    try {
        logger.info("📡 Pushing to website webhook...");
        const success = await webhookService.notify({
            topic: TOKEN.topic,
            symbol: TOKEN.symbol,
            tokenAddress: TOKEN.tokenAddress,
            metadataCid: "",
            imageCid: imageCid || "",
            poolAddress: TOKEN.poolAddress,
            liquidityTx: TOKEN.liquidityTx || ""
        });
        if (success) {
            logger.info("✅ Successfully pushed to website!");
        } else {
            logger.error("❌ Webhook push failed.");
        }
    } catch (err) {
        logger.error(`❌ Webhook error: ${err.message}`);
    }

    // Step 3: Post tweet
    try {
        const twitter = new TweetApiCom();
        const tweetText = `🚀 $${TOKEN.symbol} is LIVE on Base! 🎮\n\nThe ${TOKEN.topic} trend just got tokenized by the AI agent.\n\n🔗 Trade: https://app.uniswap.org/explore/tokens/base/${TOKEN.tokenAddress}\n\n#Base #DeFi #${TOKEN.symbol} #AI`;
        logger.info("🐦 Posting tweet...");
        await twitter.postTweet(tweetText);
        logger.info("✅ Tweet posted!");
    } catch (err) {
        logger.error(`❌ Tweet failed: ${err.message}`);
    }

    logger.info("\n🎉 Recovery complete!");
}

recoverToken();
