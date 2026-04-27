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
        logger.info(`[DEBUG] Step 1: Initializing StateManager...`);
        const stateManager = new StateManager();
        await stateManager.connect();

        // 2. Initialize Signer with Base Sepolia RPC
        logger.info(`[DEBUG] Step 2: Initializing signer with Base Sepolia...`);
        const provider = new hre.ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org');
        const deployer = new hre.ethers.Wallet(process.env.AGENT_WALLET_PRIVATE_KEY, provider);
        logger.info(`[DEBUG] Agent active with address: ${deployer.address}`);

        // 3. Initialize Pipeline
        logger.info(`[DEBUG] Step 3: Initializing Pipeline...`);
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
