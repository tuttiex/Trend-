const hre = require("hardhat");
const PriceSyncService = require('./services/priceSyncService');
const StateManager = require('./services/stateManager');
const logger = require('./utils/logger');
require('dotenv').config();

const SYNC_INTERVAL_MS = 3 * 60 * 1000; // Every 3 minutes

async function syncPrices(stateManager, priceSyncService) {
    try {
        const query = `SELECT token_symbol, token_address, pool_address FROM deployments WHERE pool_address IS NOT NULL AND pool_address != ''`;
        const deployments = await new Promise((resolve, reject) => {
            stateManager.db.all(query, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        if (deployments.length === 0) {
            logger.info('[PriceSync] No deployments with pool addresses found');
            return;
        }

        logger.info(`[PriceSync] Syncing prices for ${deployments.length} tokens`);
        await priceSyncService.syncAllPrices(deployments);
    } catch (error) {
        logger.error(`[PriceSync] Error syncing prices: ${error.message}`);
    }
}

async function main() {
    logger.info('--- PriceSync Standalone Service Starting ---');

    try {
        // Initialize State Manager
        const stateManager = new StateManager();
        await stateManager.connect();

        // Initialize blockchain provider
        const provider = new hre.ethers.JsonRpcProvider(
            process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org'
        );

        // Initialize PriceSync service
        const priceSyncService = new PriceSyncService(provider);

        logger.info(`PriceSync running every ${SYNC_INTERVAL_MS / 1000 / 60} minutes`);

        // Run immediately on startup
        await syncPrices(stateManager, priceSyncService);

        // Schedule periodic sync
        setInterval(async () => {
            await syncPrices(stateManager, priceSyncService);
        }, SYNC_INTERVAL_MS);

    } catch (error) {
        logger.error(`[PriceSync] Critical failure during startup: ${error.message}`);
        process.exit(1);
    }
}

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
    logger.error('[PriceSync] Unhandled Rejection at:', promise, 'reason:', reason);
});

main();
