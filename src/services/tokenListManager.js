const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const ipfsUploader = require('./ipfsUploader');
const tokenRegistryService = require('./tokenRegistryService');
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
            logger.info("📊 Generating Uniswap Token List from On-Chain Registry...");

            await this.stateManager.connect();
            const deployments = await this.stateManager.getAllDeployments();
            const chainId = parseInt(process.env.CHAIN_ID || "8453");

            const tokens = [];

            for (const dep of deployments) {
                if (!dep.token_address) continue;

                const metadataCid = await tokenRegistryService.getMetadata(dep.token_address);

                if (metadataCid) {
                    let logoURI = dep.logo_uri || metadataCid.replace('ipfs://', '');

                    // If it's just a CID, convert to ipfs:// (Uniswap standard)
                    if (!logoURI.startsWith('http') && !logoURI.startsWith('ipfs://')) {
                        logoURI = `ipfs://${logoURI}`;
                    }

                    // Clean up any double gateway if it sneaked in
                    logoURI = logoURI.replace('https://gateway.pinata.cloud/ipfs/https://gateway.pinata.cloud/ipfs/', 'https://gateway.pinata.cloud/ipfs/');

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

            const tokenList = {
                name: "OpenClaw Trend Tokens",
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

            // 2. Upload to IPFS
            const listCid = await ipfsUploader.uploadMetadata(tokenList);
            const listUrl = `https://gateway.pinata.cloud/ipfs/${listCid}`;

            logger.info(`✅ Token List published to IPFS: ${listUrl}`);
            return listUrl;
        } catch (error) {
            logger.error(`❌ Token List Failed: ${error.message}`);
            throw error;
        } finally {
            try { await this.stateManager.close(); } catch (e) { }
        }
    }
}

module.exports = new TokenListManager();
