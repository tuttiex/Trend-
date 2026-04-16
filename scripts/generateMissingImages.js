#!/usr/bin/env node
/**
 * Generate images for tokens that were deployed without logos
 * Updates database and optionally re-sends webhooks with image data
 */

require('dotenv').config();
const StateManager = require('../src/services/stateManager');
const imageGenerator = require('../src/services/imageGenerator');
const ipfsUploader = require('../src/services/ipfsUploader');
const webhookService = require('../src/services/webhookService');
const logger = require('../src/utils/logger');

async function generateMissingImages() {
    const stateManager = new StateManager();

    try {
        // Find all deployments from the last 7 days without logo_uri
        const query = `
            SELECT trend_topic, token_symbol, token_address, region, timestamp, metadata_cid
            FROM deployments 
            WHERE (logo_uri IS NULL OR logo_uri = '') 
            AND timestamp >= date('now', '-7 days')
            AND token_address IS NOT NULL
            ORDER BY timestamp DESC
        `;
        
        const deployments = await new Promise((resolve, reject) => {
            stateManager.db.all(query, [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
        
        if (deployments.length === 0) {
            logger.info('✅ No tokens found missing images in the last 7 days');
            return;
        }

        logger.info(`🎨 Found ${deployments.length} tokens missing images`);
        
        let successCount = 0;
        let failCount = 0;

        for (const deployment of deployments) {
            logger.info(`\n🔄 Processing: ${deployment.token_symbol} (${deployment.trend_topic})`);
            
            try {
                // Generate image
                logger.info(`  🎨 Generating logo for ${deployment.token_symbol}...`);
                const imageBuffer = await imageGenerator.generateTokenLogo(
                    deployment.trend_topic, 
                    deployment.token_symbol, 
                    deployment.region
                );

                if (!imageBuffer) {
                    logger.warn(`  ⚠️ Image generation failed for ${deployment.token_symbol}`);
                    failCount++;
                    continue;
                }

                // Upload to IPFS
                logger.info(`  📤 Uploading to IPFS...`);
                const imageCid = await ipfsUploader.uploadImage(imageBuffer, deployment.token_symbol);
                const gatewayBase = "https://gateway.pinata.cloud/ipfs/";
                const logoUri = `${gatewayBase}${imageCid}?filename=${deployment.token_symbol}.png`;

                // Update database
                logger.info(`  💾 Updating database...`);
                await new Promise((resolve, reject) => {
                    stateManager.db.run(
                        `UPDATE deployments SET logo_uri = ? WHERE token_address = ?`,
                        [logoUri, deployment.token_address],
                        (err) => err ? reject(err) : resolve()
                    );
                });

                // Use existing metadata_cid or create new one
                let metadataCid = deployment.metadata_cid;
                if (!metadataCid) {
                    const metadata = {
                        name: `${deployment.trend_topic} Token`,
                        symbol: deployment.token_symbol,
                        description: `Deployed by Trends Agent. Bonding Curve DEX with 0.7% swap fee. Trend: ${deployment.trend_topic} in ${deployment.region}.`,
                        image: logoUri,
                        external_url: `https://basescan.org/token/${deployment.token_address}`,
                        attributes: [
                            { trait_type: "Region", value: deployment.region },
                            { trait_type: "Trend", value: deployment.trend_topic },
                            { trait_type: "DEX Type", value: "Bonding Curve" }
                        ]
                    };
                    metadataCid = await ipfsUploader.uploadMetadata(metadata);
                    
                    // Update metadata_cid in database
                    await new Promise((resolve, reject) => {
                        stateManager.db.run(
                            `UPDATE deployments SET metadata_cid = ? WHERE token_address = ?`,
                            [metadataCid, deployment.token_address],
                            (err) => err ? reject(err) : resolve()
                        );
                    });
                }

                // Send webhook to update website
                logger.info(`  📡 Sending webhook to website...`);
                await webhookService.notify({
                    event: 'TOKEN_UPDATED',
                    timestamp: new Date().toISOString(),
                    data: {
                        topic: deployment.trend_topic,
                        symbol: deployment.token_symbol,
                        region: deployment.region,
                        tokenAddress: deployment.token_address,
                        imageCid: imageCid,
                        metadataCid: metadataCid,
                        logoUri: logoUri,
                        chainId: '8453'
                    }
                });

                logger.info(`  ✅ Success! Logo: ${logoUri}`);
                successCount++;

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
                logger.error(`  ❌ Error processing ${deployment.token_symbol}: ${error.message}`);
                failCount++;
            }
        }

        logger.info(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed`);

    } finally {
        await stateManager.close();
    }
}

// Run if called directly
if (require.main === module) {
    generateMissingImages()
        .then(() => {
            logger.info('✅ Done');
            process.exit(0);
        })
        .catch(error => {
            logger.error(`❌ Fatal error: ${error.message}`);
            process.exit(1);
        });
}

module.exports = { generateMissingImages };
