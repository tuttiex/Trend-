const cron = require('node-cron');
const logger = require('./utils/logger');

class Scheduler {
    constructor(pipeline) {
        this.pipeline = pipeline;
        this.failureCount = 0;
        this.isPaused = false;
        this.MAX_FAILURES = 3;
    }

    start() {
        logger.info('Scheduler starting...');

        // Nigeria: 10 PM WAT = 9 PM UTC
        // cron.schedule(minute, hour, dayOfMonth, month, dayOfWeek)
        cron.schedule('0 21 * * *', async () => {
            logger.info('Starting Nigeria cycle (10 PM WAT)...');
            await this.runCycle('Nigeria');
        }, {
            timezone: "UTC"
        });

        // US: 10 PM EST = 3 AM UTC (Next Day)
        // Note: If it's 10 PM EST Monday, it's 3 AM UTC Tuesday.
        cron.schedule('0 3 * * *', async () => {
            logger.info('Starting United States cycle (10 PM EST)...');
            await this.runCycle('United States');
        }, {
            timezone: "UTC"
        });

        logger.info('Scheduler jobs scheduled.');
    }

    async runCycle(region) {
        if (this.isPaused) {
            logger.warn(`Scheduler: Agent is PAUSED due to consecutive failures. Skipping ${region} cycle.`);
            return;
        }

        try {
            logger.info(`Scheduler: Initiating pipeline for ${region}`);
            await this.pipeline.execute(region);
            logger.info(`Scheduler: Pipeline for ${region} completed successfully.`);
            this.failureCount = 0; // Reset on success
        } catch (error) {
            this.failureCount++;
            logger.error(`Scheduler: Pipeline for ${region} failed (Attempt ${this.failureCount}/${this.MAX_FAILURES}): ${error.message}`);

            if (this.failureCount >= this.MAX_FAILURES) {
                this.isPaused = true;
                logger.error('🚨 CIRCUIT BREAKER TRIGGERED: Agent is now PAUSED. Manual intervention required.');
            }

            if (this.handleFailure) {
                await this.handleFailure(region, error);
            }
        }
    }

    async handleFailure(region, error) {
        logger.error(`Handling failure for ${region}: ${error.message}`);
        // Future: Circuit breaker or emergency pause logic
    }
}

module.exports = Scheduler;
