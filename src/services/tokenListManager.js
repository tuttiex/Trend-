const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const r2Uploader = require('./r2Uploader');
const StateManager = require('./stateManager');
const Ajv = require('ajv');
const addFormats = require('ajv-formats').default;

// Direct import of schema since the npm package has build issues in Node
const tokenListSchema = require('@uniswap/token-lists/src/tokenlist.schema.json');

class TokenListManager {
    constructor() {
        this.stateManager = new StateManager();
        this.ajv = new Ajv({ allErrors: true, verbose: true });
        addFormats(this.ajv);
        this.validator = this.ajv.compile(tokenListSchema);
    }

    async generateAndUploadList() {
        try {
            logger.info("📊 Generating Uniswap Token List from Database...");

            await this.stateManager.connect();
            const deployments = await this.stateManager.getAllDeployments();
            const chainId = parseInt(process.env.CHAIN_ID || "8453");

            const tokens = [];

            for (const dep of deployments) {
                if (!dep.token_address) continue;

                // Use metadata from database (now contains R2 URLs)
                const metadataUrl = dep.metadata_cid;

                if (metadataUrl) {
                    // Use logo_uri from database (now contains R2 URLs)
                    let logoURI = dep.logo_uri;

                    // Fallback to metadata URL if no logo_uri
                    if (!logoURI) {
                        logoURI = metadataUrl.replace('/metadata/', '/logos/').replace('.json', '.png');
                    }

                    tokens.push({
                        chainId: chainId,
                        address: dep.token_address,
                        name: `${dep.trend_topic || 'Trend'} Token`,
                        symbol: dep.token_symbol || 'TREND',
                        decimals: 18,
                        logoURI: logoURI
                    });
                }
            }

            if (tokens.length === 0) {
                logger.warn("⚠️ Token List Sync: No tokens with metadata found in database. Skipping generation.");
                return null;
            }

            const tokenList = {
                name: "Trends Agent Tokens",
                timestamp: new Date().toISOString(),
                version: {
                    major: 1,
                    minor: tokens.length,
                    patch: 0
                },
                tokens: tokens
            };

            // --- VALIDATION (Official Uniswap Spec) ---
            logger.info("🛡️ Validating Token List against official Uniswap schema...");
            const valid = this.validator(tokenList);
            if (!valid) {
                const errors = this.validator.errors.map(err => `${err.instancePath} ${err.message}`).join(', ');
                throw new Error(`Invalid Token List Schema: ${errors}`);
            }
            logger.info("✅ Validation Passed!");

            // 2. Upload to R2
            const timestamp = Date.now();
            const listBuffer = Buffer.from(JSON.stringify(tokenList, null, 2));
            const listUrl = await r2Uploader.uploadTokenList(listBuffer, `tokenlist_${timestamp}.json`);

            logger.info(`✅ Token List published to R2: ${listUrl}`);
            return listUrl;
        } catch (error) {
            logger.error(`❌ Token List Failed: ${error.message}`);
            throw error;
        }
        // Note: Database connection kept open for pipeline continuation
    }
}

module.exports = new TokenListManager();
