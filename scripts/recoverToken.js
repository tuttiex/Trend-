/**
 * Full Recovery Script for a partially deployed token.
 * Run with: npx hardhat run scripts/recoverToken.js --network base
 *
 * This script:
 *   1. Adds liquidity to the existing empty pool
 *   2. Generates and uploads the token logo to IPFS
 *   3. Pushes the token to the website webhook
 *   4. Posts a tweet announcing the token
 */

const hre = require("hardhat");
const LiquidityManager = require('../src/services/liquidityManager');
const imageGenerator = require('../src/services/imageGenerator');
const ipfsUploader = require('../src/services/ipfsUploader');
const webhookService = require('../src/services/webhookService');
const TweetApiCom = require('../src/services/tweetApiCom');
const logger = require('../src/utils/logger');
require('dotenv').config();

// ── TOKEN TO RECOVER ──────────────────────────────────────────────────────────
const TOKEN = {
    topic: "Xbox",
    symbol: "XBOX",
    region: "United States",
    tokenAddress: "0xCEAb6b1FdcB9f2bbCb9A59043ce0E34140c0C2E5",
    poolAddress: "0x94B63eC03ae89c226E3ba98AfF66F290a5b4B459",
    amountTokens: "100000000",  // 100M tokens
    amountETH: "0.0004"       // 0.0004 ETH
};
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    logger.info(`\n🔧 Starting full recovery for ${TOKEN.topic} ($${TOKEN.symbol})`);
    const [signer] = await hre.ethers.getSigners();
    logger.info(`Using wallet: ${await signer.getAddress()}`);

    let liquidityTx = null;
    let imageCid = null;

    // ── STEP 1: Add Liquidity ─────────────────────────────────────────────────
    logger.info("\n📦 Step 1: Adding liquidity to the empty pool...");
    try {
        const liquidityManager = new LiquidityManager(hre.ethers.provider, signer);
        await liquidityManager.init();

        const initialPrice = (parseFloat(TOKEN.amountETH) / parseFloat(TOKEN.amountTokens)).toFixed(18);
        logger.info(`Initializing pool at price: ${initialPrice} ETH per token`);
        await liquidityManager.initializePool(TOKEN.tokenAddress, TOKEN.poolAddress, initialPrice);

        liquidityTx = await liquidityManager.addLiquidity(TOKEN.tokenAddress, TOKEN.amountTokens, TOKEN.amountETH);
        if (liquidityTx === "ALREADY_EXISTING_LIQUIDITY") {
            logger.info("✅ Pool already has liquidity. Skipping mint.");
            liquidityTx = "existing";
        } else {
            logger.info(`✅ Liquidity added! Tx: ${liquidityTx}`);
        }
    } catch (err) {
        logger.error(`❌ Liquidity failed: ${err.message}`);
        logger.warn("Continuing with remaining steps anyway...");
    }

    // ── STEP 2: Generate Logo ─────────────────────────────────────────────────
    logger.info("\n🎨 Step 2: Generating logo...");
    try {
        const imageBuffer = await imageGenerator.generateTokenLogo(TOKEN.topic, TOKEN.symbol, TOKEN.region);
        if (imageBuffer) {
            imageCid = await ipfsUploader.uploadImage(imageBuffer, TOKEN.symbol);
            logger.info(`✅ Logo uploaded! CID: ${imageCid}`);
        }
    } catch (err) {
        logger.error(`❌ Image generation failed: ${err.message}`);
    }

    // ── STEP 3: Push to Website ───────────────────────────────────────────────
    logger.info("\n📡 Step 3: Pushing to website...");
    try {
        const success = await webhookService.notify({
            topic: TOKEN.topic,
            symbol: TOKEN.symbol,
            tokenAddress: TOKEN.tokenAddress,
            metadataCid: "",
            imageCid: imageCid || "",
            poolAddress: TOKEN.poolAddress,
            liquidityTx: liquidityTx || ""
        });
        logger.info(success ? "✅ Pushed to website!" : "❌ Webhook push failed.");
    } catch (err) {
        logger.error(`❌ Webhook error: ${err.message}`);
    }

    // ── STEP 4: Post Tweet ────────────────────────────────────────────────────
    logger.info("\n🐦 Step 4: Posting tweet...");
    try {
        const twitter = new TweetApiCom();
        const tweetText = `🚀 $${TOKEN.symbol} is LIVE on Base! 🎮\n\nThe ${TOKEN.topic} trend just got tokenized by the AI agent.\n\n🔗 Trade: https://app.uniswap.org/explore/tokens/base/${TOKEN.tokenAddress}\n\n#Base #DeFi #${TOKEN.symbol} #AI`;
        await twitter.postTweet(tweetText);
        logger.info("✅ Tweet posted!");
    } catch (err) {
        logger.error(`❌ Tweet failed: ${err.message}`);
    }

    logger.info("\n🎉 Recovery complete!");
}

main().catch(e => {
    logger.error(`Fatal error: ${e.message}`);
    process.exit(1);
});
