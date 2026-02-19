const trendDetector = require('./modules/trendDetection');
const contentModerator = require('./utils/contentModerator');
const DeploymentOrchestrator = require('./services/deploymentOrchestrator');
const logger = require('./utils/logger');
const StateManager = require('./services/stateManager');
const SafetyManager = require('./utils/safetyManager');
const tokenListManager = require('./services/tokenListManager');
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

        if (this.stateManager) {
            try {
                const isComplete = await this.stateManager.hasCompletedDeploymentToday(region);
                if (isComplete) {
                    logger.warn(`🛑 DAILY GUARD: ${region} already has a successful token launch today. Skipping cycle.`);
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
            throw error;
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

        let existing = null;
        if (this.stateManager) {
            existing = await this.stateManager.getDeploymentByTopic(trend.topic, region);
            if (existing && existing.tx_hash && existing.pool_address) {
                logger.info(`Pipeline: Trend "${trend.topic}" already fully deployed today at ${existing.token_address}. Skipping.`);
                return { status: 'skipped', reason: 'already_deployed' };
            }

            if (!existing) {
                logger.info(`Pipeline: Recording discovery of trend "${trend.topic}" for idempotency.`);
                await this.stateManager.saveDeployment({
                    executionId,
                    topic: trend.topic,
                    region: region,
                    symbol: "PENDING",
                    tokenAddress: null
                });
                existing = await this.stateManager.getDeploymentByTopic(trend.topic, region);
            }
        }

        // 2. Content Moderation
        logger.info('Pipeline: Stage 2 - Content Moderation');
        const moderation = await contentModerator.checkTopic(trend.topic);
        if (!moderation.approved) {
            logger.warn(`Pipeline: Trend "${trend.topic}" rejected: ${moderation.reason}`);
            throw new Error(`Moderation rejected: ${moderation.reason}`);
        }
        logger.info(`Pipeline: Trend "${trend.topic}" approved. Symbol: ${moderation.symbol}`);

        // 3. Planning
        logger.info('Pipeline: Stage 3 - Planning');
        const plan = {
            topic: trend.topic,
            symbol: moderation.symbol,
            region: region,
            initialLiquidityETH: "0.0004",
            initialLiquidityTokens: "100000000"
        };

        if (existing && existing.token_address) {
            logger.info(`Pipeline: Found partial deployment for ${trend.topic}. Resuming from ${existing.token_address}...`);
            plan.existingToken = existing.token_address;
            plan.metadataCid = existing.metadata_cid;
        }

        // 4. Validation
        logger.info('Pipeline: Stage 4 - Validation');
        const safetyCheck = await this.safety.checkSafety(plan);
        if (!safetyCheck.safe) {
            logger.error(`Pipeline: Safety check failed: ${safetyCheck.reason}`);
            throw new Error(`Safety check failed: ${safetyCheck.reason}`);
        }

        // 5. Onchain Execution
        logger.info('Pipeline: Stage 5 - Onchain Execution');
        let result;
        try {
            result = await this.orchestrator.executeDeployment(plan);
            logger.info(`Pipeline: Execution successful. Token: ${result.tokenAddress}`);
        } catch (error) {
            logger.error(`Pipeline: Onchain execution failed: ${error.message}`);
            if (this.stateManager) {
                await this.stateManager.updateDeploymentByTopic(trend.topic, region, {
                    token_address: error.tokenAddress,
                    metadata_cid: error.metadataCid,
                    pool_address: error.poolAddress,
                    tx_hash: error.txHash
                });
            }
            throw error;
        }

        // 6. State Update (Final)
        logger.info('Pipeline: Stage 6 - State Update');
        if (this.stateManager) {
            try {
                await this.stateManager.updateDeploymentByTopic(trend.topic, region, {
                    token_address: result.tokenAddress,
                    metadata_cid: result.metadataCid,
                    logo_uri: result.imageCid,
                    pool_address: result.poolAddress,
                    tx_hash: result.liquidityTx
                });

                // 7. Sync Uniswap Token List
                logger.info('Pipeline: Stage 7 - Syncing Uniswap Token List');
                await tokenListManager.generateAndUploadList();

                // 8. Trigger External Webhook (trend$)
                logger.info('Pipeline: Stage 8 - Triggering trend$ Webhook');
                const webhookService = require('./services/webhookService');
                await webhookService.notify({
                    topic: trend.topic,
                    symbol: moderation.symbol,
                    tokenAddress: result.tokenAddress,
                    metadataCid: result.metadataCid,
                    imageCid: result.imageCid,
                    poolAddress: result.poolAddress,
                    liquidityTx: result.liquidityTx
                });

                logger.info(`✅ Pipeline: All stages complete for ${trend.topic}`);
            } catch (dbError) {
                logger.error(`Pipeline: Failed to save final state: ${dbError.message}`);
            }
        }
        return result;
    }
}

module.exports = Pipeline;
