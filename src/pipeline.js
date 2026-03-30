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

    async execute(trend, region) {
        const executionId = `exec_${Date.now()}`;
        logger.info(`Pipeline: Starting execution ${executionId} for trend: ${trend.name} in region: ${region}`);

        try {
            const result = await this._runStages(trend, region, executionId);
            return { status: 'success', result };
        } catch (error) {
            logger.error(`Pipeline: Execution encountered an error: ${error.message}`);
            throw error;
        }
    }

    async _runStages(trend, region, executionId) {
        // 1. AI Moderation
        logger.info('Pipeline: Stage 1 - AI Moderation');
        const moderationResult = await contentModerator.checkTopic(trend.name);
        if (!moderationResult.approved) {
            logger.warn(`Pipeline: Trend "${trend.name}" rejected by AI: ${moderationResult.reason}. Skipping deployment.`);
            return { status: 'skipped', reason: 'ai_rejected' };
        }
        logger.info(`Pipeline: ✅ Trend "${trend.name}" APPROVED for deployment! Symbol: ${moderationResult.symbol}`);

        // We have a winner, lock it in the database for idempotency
        if (this.stateManager) {
            logger.info(`Pipeline: Recording discovery of trend "${trend.name}" for idempotency.`);
            await this.stateManager.saveDeployment({
                executionId,
                topic: trend.name,
                region: region,
                symbol: "PENDING",
                tokenAddress: null
            });
        }

        // 2. Planning (Momentum Engine determines the dynamic supply of the new token)
        logger.info('Pipeline: Stage 2 - Planning');
        const momentumCalculator = require('./modules/momentumCalculator');
        let supply = "10000000"; // baseline fallback
        if (this.stateManager) {
            const avgVolume = await this.stateManager.getAverageVolume(region);
            supply = momentumCalculator.calculateSupply(trend.volume, avgVolume);
        }

        const plan = {
            topic: trend.name,
            symbol: moderationResult.symbol,
            region: region,
            initialLiquidityETH: "0.0004",  // Testnet WETH config
            initialLiquidityTokens: supply.toString()
        };

        // If for any reason the deploy was partially interrupted previously, we attempt resumption
        let existing = null;
        if (this.stateManager) {
            existing = await this.stateManager.getDeploymentByTopic(trend.name, region);
            if (existing && existing.token_address) {
                logger.info(`Pipeline: Found partial deployment for ${trend.name}. Resuming from ${existing.token_address}...`);
                plan.existingToken = existing.token_address;
                plan.metadataCid = existing.metadata_cid;
            }
        }

        // 3. Validation
        logger.info('Pipeline: Stage 3 - Validation');
        const safetyCheck = await this.safety.checkSafety(plan);
        if (!safetyCheck.safe) {
            logger.error(`Pipeline: Safety check failed: ${safetyCheck.reason}`);
            throw new Error(`Safety check failed: ${safetyCheck.reason}`);
        }

        // 4. Onchain Execution
        logger.info('Pipeline: Stage 4 - Onchain Execution');
        let result;
        try {
            result = await this.orchestrator.executeDeployment(plan);
            logger.info(`Pipeline: Execution successful. Token: ${result.tokenAddress}`);
        } catch (error) {
            logger.error(`Pipeline: Onchain execution failed: ${error.message}`);
            if (this.stateManager) {
                await this.stateManager.updateDeploymentByTopic(trend.name, region, {
                    token_address: error.tokenAddress,
                    metadata_cid: error.metadataCid,
                    pool_address: error.poolAddress,
                    tx_hash: error.txHash
                });
            }
            throw error;
        }

        // 4. State Update (Final)
        logger.info('Pipeline: Stage 4 - State Update');
        if (this.stateManager) {
            try {
                await this.stateManager.updateDeploymentByTopic(trend.name, region, {
                    token_address: result.tokenAddress,
                    token_symbol: moderationResult.symbol,
                    metadata_cid: result.metadataCid,
                    logo_uri: result.imageCid,
                    pool_address: result.poolAddress,
                    tx_hash: result.liquidityTx
                });

                // 5. Sync Uniswap Token List
                logger.info('Pipeline: Stage 5 - Syncing Uniswap Token List');
                await tokenListManager.generateAndUploadList();

                // 6. Trigger External Webhook (trend$)
                logger.info('Pipeline: Stage 6 - Triggering trend$ Webhook');
                const webhookService = require('./services/webhookService');
                await webhookService.notify({
                    topic: trend.name,
                    symbol: moderationResult.symbol,
                    region: region,
                    tokenAddress: result.tokenAddress,
                    metadataCid: result.metadataCid,
                    imageCid: result.imageCid,
                    poolAddress: result.poolAddress,
                    liquidityTx: result.liquidityTx
                });

                logger.info(`✅ Pipeline: All stages complete for ${trend.name}`);
            } catch (dbError) {
                logger.error(`Pipeline: Failed to save final state: ${dbError.message}`);
            }
        }
        return result;
    }
}

module.exports = Pipeline;
