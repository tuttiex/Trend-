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
            // Check if it has a logo_uri (image CID or full URL)
            if (dep.logo_uri) {
                let imageCid = dep.logo_uri;

                // FIX: If it's a full URL (common in older deployments like SIMI), extract just the CID
                if (imageCid.startsWith('http')) {
                    const matches = imageCid.match(/ipfs\/(Qm[a-zA-Z0-9]{44}|ba[a-zA-Z0-9]{57})/);
                    if (matches && matches[1]) {
                        imageCid = matches[1];
                    }
                }

                console.log(`📡 Pushing ${dep.trend_topic} (${dep.token_address}) - Image CID: ${imageCid}`);

                const payload = {
                    topic: dep.trend_topic,
                    symbol: dep.token_symbol,
                    tokenAddress: dep.token_address,
                    metadataCid: dep.token_uri, // The JSON metadata CID
                    imageCid: imageCid,         // The raw image CID
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
