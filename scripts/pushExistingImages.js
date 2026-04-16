#!/usr/bin/env node
/**
 * Push existing images from database to website WITHOUT regenerating
 */

require('dotenv').config();
const StateManager = require('../src/services/stateManager');
const webhookService = require('../src/services/webhookService');
const logger = require('../src/utils/logger');

// Extract CID from logo_uri like: https://gateway.pinata.cloud/ipfs/QmXXX?filename=SYM.png
function extractCid(logoUri) {
    if (!logoUri) return null;
    const match = logoUri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

async function pushExistingImages() {
    const stateManager = new StateManager();

    try {
        // Find tokens WITH images but might need webhook refresh
        const query = `
            SELECT trend_topic, token_symbol, token_address, region, metadata_cid, logo_uri
            FROM deployments 
            WHERE logo_uri IS NOT NULL 
            AND logo_uri != ''
            AND timestamp >= date('now', '-7 days')
            ORDER BY timestamp DESC
        `;
        
        const deployments = await new Promise((resolve, reject) => {
            stateManager.db.all(query, [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
        
        if (deployments.length === 0) {
            logger.info('No tokens with images found');
            return;
        }

        logger.info(`Found ${deployments.length} tokens with existing images`);
        
        let successCount = 0;

        for (const d of deployments) {
            const imageCid = extractCid(d.logo_uri);
            if (!imageCid) {
                logger.warn(`Could not extract CID from: ${d.logo_uri}`);
                continue;
            }

            logger.info(`Pushing ${d.token_symbol} with image CID: ${imageCid}`);
            
            try {
                await webhookService.notify({
                    event: 'TOKEN_DEPLOYED',
                    timestamp: new Date().toISOString(),
                    data: {
                        topic: d.trend_topic,
                        symbol: d.token_symbol,
                        region: d.region,
                        tokenAddress: d.token_address,
                        metadataCid: d.metadata_cid,
                        imageCid: imageCid,
                        chainId: '8453'
                    }
                });
                
                logger.info(`✅ ${d.token_symbol} pushed successfully`);
                successCount++;
                
                // Small delay to avoid rate limiting
                await new Promise(r => setTimeout(r, 500));

            } catch (error) {
                logger.error(`❌ Failed to push ${d.token_symbol}: ${error.message}`);
            }
        }

        logger.info(`Done: ${successCount}/${deployments.length} pushed`);

    } finally {
        await stateManager.close();
    }
}

pushExistingImages()
    .then(() => { logger.info('Complete'); process.exit(0); })
    .catch(e => { logger.error('Fatal: ' + e.message); process.exit(1); });
