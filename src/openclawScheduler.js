const cron = require('node-cron');
const { exec } = require('child_process');
const logger = require('./utils/logger');

class OpenClawScheduler {
    constructor() {
        this.failureCount = 0;
        this.isPaused = false;
        this.MAX_FAILURES = 3;
    }

    start() {
        logger.info('OpenClaw Scheduler starting...');

        // Nigeria: 9:00 PM WAT = 20:00 UTC
        cron.schedule('0 20 * * *', async () => {
            logger.info('Triggering Nigeria cycle via OpenClaw (20:00 UTC / 21:00 WAT)...');
            await this.triggerOpenClaw('Nigeria');
        }, {
            timezone: "UTC"
        });

        // US: 9:00 PM EST = 02:00 UTC (Next Day)
        cron.schedule('0 2 * * *', async () => {
            logger.info('Triggering United States cycle via OpenClaw (02:00 UTC / 21:00 EST)...');
            await this.triggerOpenClaw('United States');
        }, {
            timezone: "UTC"
        });

        logger.info('OpenClaw scheduler jobs scheduled.');
    }

    async triggerOpenClaw(region) {
        if (this.isPaused) {
            logger.warn(`OpenClawScheduler: Agent is PAUSED due to consecutive failures. Skipping ${region} cycle.`);
            return;
        }

        try {
            logger.info(`OpenClawScheduler: Triggering OpenClaw for ${region}...`);

            // Use 'base' (Mainnet) for production. Can be overridden by env.
            const network = process.env.HARDHAT_NETWORK || 'base';

            // Execute the pipeline script directly using Hardhat environment
            // Pass region via environment variable to avoid Hardhat CLI parsing issues
            const command = `npx hardhat run src/run_pipeline.js --network ${network}`;

            logger.info(`Command: ${command} (REGION=${region})`);

            await new Promise((resolve, reject) => {
                // copy current env and add REGION
                const env = {
                    ...process.env,
                    REGION: region,
                    // Force production mode if on Mainnet to ensure correct contract addresses
                    NODE_ENV: network === 'base' ? 'production' : process.env.NODE_ENV
                };

                exec(command, { env }, (error, stdout, stderr) => {
                    if (error) {
                        logger.error(`OpenClawScheduler: Error executing pipeline: ${error.message}`);
                        // Log stderr for debugging
                        if (stderr) logger.error(`stderr: ${stderr}`);
                        reject(error);
                        return;
                    }
                    if (stderr) {
                        logger.warn(`OpenClawScheduler: Pipeline stderr: ${stderr}`);
                    }
                    logger.info(`OpenClawScheduler: Pipeline stdout: ${stdout}`);
                    resolve();
                });
            });

            this.failureCount = 0; // Reset on success
            logger.info(`OpenClawScheduler: Successfully finished ${region} cycle.`);
        } catch (error) {
            this.failureCount++;
            logger.error(`OpenClawScheduler: Failed to trigger ${region} (Attempt ${this.failureCount}/${this.MAX_FAILURES}): ${error.message}`);

            if (this.failureCount >= this.MAX_FAILURES) {
                this.isPaused = true;
                logger.error('🚨 CIRCUIT BREAKER TRIGGERED: OpenClaw scheduler is now PAUSED. Manual intervention required.');
            }
        }
    }
}

module.exports = OpenClawScheduler;

// Auto-start if run directly
if (require.main === module) {
    const scheduler = new OpenClawScheduler();
    scheduler.start();
}
