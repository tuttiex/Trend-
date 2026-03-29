const hre = require("hardhat");
const Pipeline = require('./pipeline');
const Scheduler = require('./scheduler');
const StateManager = require('./services/stateManager');
const logger = require('./utils/logger');
require('dotenv').config();

async function main() {
    logger.info('--- Autonomous Social-Signal Token Agent Starting ---');

    try {
        // 1. Initialize State Manager
        const stateManager = new StateManager();
        // await stateManager.connect(); // Optional check, pipeline handles it or we can do it here

        // 2. Initialize Signer (using hardhat's default for this environment)
        const [deployer] = await hre.ethers.getSigners();
        logger.info(`Agent active with address: ${deployer.address}`);

        // 3. Initialize Pipeline
        const pipeline = new Pipeline(deployer, stateManager);

        // 4. Initialize Scheduler (Re-enabled for frequent Trend Monitoring)
        const scheduler = new Scheduler(pipeline);
        scheduler.start();

        logger.info('Agent is now running with 15-minute trend monitoring active.');
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
