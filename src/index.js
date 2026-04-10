const hre = require("hardhat");
const Pipeline = require('./pipeline');
const Scheduler = require('./scheduler');
const StateManager = require('./services/stateManager');
const logger = require('./utils/logger');
const TelegramBotService = require('./services/telegramBot');
const TelegramNotifier = require('./services/telegramNotifier');
require('dotenv').config();

async function main() {
    logger.info('--- Autonomous Social-Signal Token Agent Starting ---');

    let telegramBot = null;
    let notifier = null;

    try {
        // 1. Initialize Telegram Bot (if enabled)
        if (process.env.ENABLE_TELEGRAM_NOTIFICATIONS === 'true' && process.env.TRENDY_THEBOT_ACCESS_TOKEN) {
            try {
                telegramBot = new TelegramBotService();
                notifier = new TelegramNotifier(telegramBot);
                logger.info('Telegram Bot Service initialized successfully');
            } catch (botError) {
                logger.error(`Failed to initialize Telegram Bot: ${botError.message}`);
                // Continue without bot - don't fail startup
            }
        }

        // 2. Initialize State Manager
        const stateManager = new StateManager();
        await stateManager.connect(); 

        // 3. Initialize Signer (using hardhat's default for this environment)
        const [deployer] = await hre.ethers.getSigners();
        logger.info(`Agent active with address: ${deployer.address}`);

        // Notify about agent startup
        if (notifier) {
            notifier.info(`🚀 Agent started\n\nAddress: \`${deployer.address}\`\nNetwork: ${process.env.BLOCKCHAIN_NETWORK || 'unknown'}`);
        }

        // 4. Initialize Pipeline (with notifier)
        const pipeline = new Pipeline(deployer, stateManager, notifier);

        // 5. Initialize Scheduler (Re-enabled for frequent Trend Monitoring)
        const scheduler = new Scheduler(pipeline, notifier);
        scheduler.start();

        // Notify about scheduler start
        if (notifier) {
            notifier.schedulerStatus('started', '15-minute trend monitoring active');
        }

        logger.info('Agent is now running with 15-minute trend monitoring active.');
    } catch (error) {
        logger.error(`Critical Failure during startup: ${error.message}`);
        
        // Notify about critical failure
        if (notifier) {
            notifier.error('Agent Startup', error);
        }
        
        process.exit(1);
    }
}

// Global error handling for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

main();
