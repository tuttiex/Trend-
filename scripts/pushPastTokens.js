const StateManager = require('../src/services/stateManager');
const webhookService = require('../src/services/webhookService');
const logger = require('../src/utils/logger');
require('dotenv').config();

async function pushPastTokens() {
    const stateManager = new StateManager();
    await stateManager.connect();

    try {
        console.log("🔍 Checking database for past tokens with images...");
        const deployments = await stateManager.getAllDeployments();

        let pushedCount = 0;
        for (const dep of deployments) {
            // Check if it has a logo_uri (image CID)
            if (dep.logo_uri) {
                console.log(`📡 Pushing ${dep.trend_topic} (${dep.token_address})...`);

                const payload = {
                    topic: dep.trend_topic,
                    symbol: dep.token_symbol,
                    tokenAddress: dep.token_address,
                    metadataCid: dep.token_uri, // The JSON metadata CID
                    imageCid: dep.logo_uri,     // The raw image CID
                    poolAddress: dep.pool_address,
                    liquidityTx: dep.tx_hash
                };

                const success = await webhookService.notify(payload);
                if (success) {
                    pushedCount++;
                    console.log(`   ✅ Success`);
                } else {
                    console.log(`   ❌ Failed (Check WEBHOOK_URL)`);
                }
            } else {
                console.log(`   ⏭️  Skipping ${dep.trend_topic} (No image CID)`);
            }
        }

        console.log(`\n🎉 Finished! Pushed ${pushedCount} tokens to your website.`);
    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        await stateManager.close();
    }
}

pushPastTokens().catch(console.error);
