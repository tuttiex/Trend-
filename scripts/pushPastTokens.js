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

                console.log(`📡 Pushing ${dep.trend_topic} (${dep.token_address})`);

                // Build full R2 URLs from CIDs
                const r2BaseUrl = 'https://pub-2b1b0fa907a44fc8873846faa41ecb74.r2.dev';
                const metadataUrl = dep.metadata_cid || `${r2BaseUrl}/metadata/${dep.token_symbol}_${Date.now()}.json`;
                const imageUrl = dep.logo_uri && dep.logo_uri.startsWith('http') 
                    ? dep.logo_uri 
                    : imageCid ? `${r2BaseUrl}/logos/${imageCid}.png` : null;

                const payload = {
                    topic: dep.trend_topic,
                    symbol: dep.token_symbol,
                    region: dep.region,
                    tokenAddress: dep.token_address,
                    metadataUrl: metadataUrl,
                    imageUrl: imageUrl,
                    poolAddress: dep.pool_address,
                    liquidityTx: dep.tx_hash,
                    chainId: process.env.CHAIN_ID || 8453
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
