const trendDetector = require('./modules/trendDetection');
const contentModerator = require('./utils/contentModerator');
const DeploymentOrchestrator = require('./services/deploymentOrchestrator');
const logger = require('./utils/logger');
const StateManager = require('./services/stateManager');
const SafetyManager = require('./utils/safetyManager');
const { ethers } = require('ethers');

class Pipeline {
    constructor(signer, stateManager) {
        this.signer = signer;
        this.stateManager = stateManager;
        this.orchestrator = new DeploymentOrchestrator(signer);
        this.safety = new SafetyManager(signer);
    }

    async execute(region) {
        const executionId = `exec_${Date.now()}`;
        logger.info(`Pipeline: Starting execution ${executionId} for region: ${region}`);

        // 0. DAILY GUARD: Prevent double-deployments
        if (this.stateManager) {
            try {
                const alreadyDeployed = await this.stateManager.hasDeployedToday(region);
                if (alreadyDeployed) {
                    logger.warn(`🛑 DAILY GUARD: ${region} has already deployed a token today. Skipping cycle.`);
                    return { status: 'skipped', reason: 'already_deployed_today' };
                }
            } catch (err) {
                logger.error(`Daily Guard Check Failed: ${err.message}. Proceeding with caution.`);
            }
        }

        try {
            await this._runStages(region, executionId);
            return { status: 'success' };
        } catch (error) {
            logger.error(`Pipeline: Execution encountered an error: ${error.message}`);
            throw error; // Let the caller (Scheduler) handle the top-level error
        }
    }

    async _runStages(region, executionId) {
        // 1. Trend Detection
        logger.info('Pipeline: Stage 1 - Trend Detection');
        const trend = await trendDetector.detectTrend(region);
        if (!trend || !trend.topic) {
            logger.warn(`Pipeline: No trends found for ${region}`);
            return { status: 'skipped', reason: 'no_trends' };
        }
        logger.info(`Pipeline: Found trend "${trend.topic}" with confidence ${trend.confidence}`);

        // 2. Content Moderation
        logger.info('Pipeline: Stage 2 - Content Moderation');
        const moderation = await contentModerator.checkTopic(trend.topic);
        if (!moderation.approved) {
            logger.warn(`Pipeline: Trend "${trend.topic}" rejected: ${moderation.reason}`);
            // Log skip in state manager if needed
            throw new Error(`Moderation rejected: ${moderation.reason}`);
        }
        logger.info(`Pipeline: Trend "${trend.topic}" approved. Symbol: ${moderation.symbol}`);

        // 3. Planning (OpenClaw / Simulation)
        logger.info('Pipeline: Stage 3 - Planning');
        const plan = {
            topic: trend.topic,
            symbol: moderation.symbol,
            region: region,
            initialLiquidityETH: "0.0004", // Approx $1.20 @ $3000/ETH
            initialLiquidityTokens: "100000000" // 10% of 1 Billion Supply (Rest in your wallet)
        };

        // 4. Validation (Safety Check)
        logger.info('Pipeline: Stage 4 - Validation');
        const safetyCheck = await this.safety.checkSafety(plan);
        if (!safetyCheck.safe) {
            logger.error(`Pipeline: Safety check failed: ${safetyCheck.reason}`);
            throw new Error(`Safety check failed: ${safetyCheck.reason}`);
        }

        // 5. Onchain Execution
        logger.info('Pipeline: Stage 5 - Onchain Execution');
        const result = await this.orchestrator.executeDeployment(plan);
        logger.info(`Pipeline: Execution successful. Token: ${result.tokenAddress}`);

        // 6. State Update
        logger.info('Pipeline: Stage 6 - State Update');
        if (this.stateManager) {
            try {
                await this.stateManager.saveDeployment({
                    executionId,
                    ...plan,
                    tokenAddress: result.tokenAddress,
                    poolAddress: result.poolAddress,
                    txHash: result.liquidityTx
                });
            } catch (dbError) {
                logger.error(`Pipeline: Failed to save state to DB, but deployment succeeded: ${dbError.message}`);
                // Do not throw here, as on-chain actions are final.
            }
        }
        return result;
    }
}

module.exports = Pipeline;
