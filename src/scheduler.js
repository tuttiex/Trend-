const cron = require('node-cron');
const trendDetector = require('./modules/trendDetection');
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
        
        // --- NEW: Frequent Trend Monitoring (Every 15 Minutes) ---
        this.startTrendMonitoring('Nigeria', 15 * 60 * 1000);
        this.startTrendMonitoring('United States', 15 * 60 * 1000);
    }

    /**
     * Periodically fetches trends for a region.
     * Unlike the full cycle, this only monitors and logs trends.
     */
    startTrendMonitoring(region, intervalMs) {
        logger.info(`Starting 15-minute trend monitoring for ${region}...`);
        
        // Initial run
        this._checkTrends(region);

        setInterval(async () => {
            await this._checkTrends(region);
        }, intervalMs);
    }

    async _checkTrends(region) {
        try {
            logger.info(`[Monitoring] Checking trends for ${region}...`);
            const trendData = await trendDetector.detectTrend(region);
            if (trendData && trendData.topTrends) {
                const names = trendData.topTrends.map(t => t.name).join(', ');
                logger.info(`[Monitoring] Top trends for ${region}: ${names}`);
                
                // --- NEW: Persist to Database ---
                if (this.pipeline && this.pipeline.stateManager) {
                    await this.pipeline.stateManager.saveTrendSnapshot(trendData);
                }
            }
        } catch (error) {
            logger.error(`[Monitoring] Error detecting trends for ${region}: ${error.message}`);
        }
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
