const Pipeline = require('./pipeline');
const StateManager = require('./services/stateManager');
const logger = require('./utils/logger');
const hre = require("hardhat");
require('dotenv').config();

async function main() {
    // Use environment variable for region (safer with Hardhat CLI)
    // Default to 'Nigeria' or 'United States' if not set
    const region = process.env.REGION || 'Nigeria';

    logger.info(`--- Manual Pipeline Execution Starting for ${region} ---`);

    try {
        // 1. Initialize State Manager
        const stateManager = new StateManager();

        // 2. Initialize Signer
        const [deployer] = await hre.ethers.getSigners();
        logger.info(`Agent active with address: ${deployer.address}`);

        // 3. Initialize Pipeline
        const pipeline = new Pipeline(deployer, stateManager);

        // 4. Execute
        logger.info(`Executing pipeline for ${region}...`);
        const result = await pipeline.execute(region);

        logger.info('Pipeline execution finished:', result);
        process.exit(0);

    } catch (error) {
        logger.error(`Critical Failure during execution: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

main();
