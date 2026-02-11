const hre = require("hardhat");
const Pipeline = require('./pipeline');
const OpenClawScheduler = require('./openclawScheduler');
const StateManager = require('./services/stateManager');
const logger = require('./utils/logger');
require('dotenv').config();

async function main() {
    logger.info('--- OpenClaw-Managed Trend Agent Starting ---');

    try {
        // 1. Initialize State Manager
        const stateManager = new StateManager();

        // 2. Initialize Signer (using hardhat's default for this environment)
        const [deployer] = await hre.ethers.getSigners();
        logger.info(`Agent active with address: ${deployer.address}`);

        // 3. Initialize OpenClaw Scheduler (triggers OpenClaw at scheduled times)
        const scheduler = new OpenClawScheduler();

        // 4. Start scheduler!
        scheduler.start();

        logger.info('OpenClaw scheduler is now running. Waiting for scheduled triggers...');
    } catch (error) {
        logger.error(`Critical Failure during startup: ${error.message}`);
        process.exit(1);
    }
}

// Global error handling for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

main();
