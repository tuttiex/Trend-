const trendDetector = require('./modules/trendDetection');
const tikTokService = require('./services/tikTokService');
const logger = require('./utils/logger');

class Scheduler {
    constructor(pipeline, notifier = null) {
        this.pipeline = pipeline;
        this.notifier = notifier;
    }

    start() {
        logger.info('Agent V2 Scheduler starting...');
        
        // --- Agent V2: High-Frequency Rolling Monitoring Engine ---
        this.startTrendMonitoring('Nigeria', 15 * 60 * 1000);
        this.startTrendMonitoring('United States', 15 * 60 * 1000);
    }

    startTrendMonitoring(region, intervalMs) {
        logger.info(`Starting 15-minute high-frequency engine for ${region}...`);
        
        // Initial run
        this._checkTrends(region);

        setInterval(async () => {
            await this._checkTrends(region);
        }, intervalMs);
    }

    async _checkTrends(region) {
        try {
            // --- SEQUENTIAL PIPELINES: X first, then TikTok ---
            logger.info(`[Monitoring] Starting SEQUENTIAL trend check for ${region}...`);
            
            // STEP 1: X/Twitter pipeline (complete full cycle)
            logger.info(`[Monitoring] === STEP 1: X/Twitter pipeline for ${region} ===`);
            await this._checkXTrends(region);
            
            // Check if TikTok cache is fresh (60 min TTL)
            const tikTokCacheFresh = tikTokService.isCacheFresh(region);
            const tikTokCacheAge = tikTokService.getCacheAge(region);
            
            if (tikTokCacheFresh) {
                // Cache is fresh - skip TikTok this cycle
                const ageMins = Math.round(tikTokCacheAge / 60000);
                logger.info(`[Monitoring] TikTok cache fresh (${ageMins} mins old), skipping TikTok pipeline this cycle`);
                logger.info(`[Monitoring] Sequential trend check complete for ${region}`);
                return;
            }
            
            // Cache is stale or empty - run TikTok pipeline
            logger.info(`[Monitoring] TikTok cache stale or empty, proceeding with TikTok pipeline...`);
            
            // Delay before TikTok to avoid overlap and rate limits
            const delayMs = 30000; // 30 seconds delay
            logger.info(`[Monitoring] Waiting ${delayMs/1000}s before TikTok pipeline...`);
            await new Promise(r => setTimeout(r, delayMs));
            
            // STEP 2: TikTok pipeline (complete full cycle)
            logger.info(`[Monitoring] === STEP 2: TikTok pipeline for ${region} ===`);
            await this._checkTikTokTrends(region);
            
            logger.info(`[Monitoring] Sequential trend check complete for ${region}`);
        } catch (error) {
            logger.error(`[Monitoring] Error in sequential trend check for ${region}: ${error.message}`);
        }
    }

    /**
     * Check X/Twitter trends only
     * @param {string} region - Region name
     */
    async _checkXTrends(region) {
        try {
            logger.info(`[X-PIPELINE] Scanning X/Twitter trends for ${region}...`);
            const trendData = await trendDetector.detectXTrends(region);
            if (trendData && trendData.topTrends) {
                const names = trendData.topTrends.map(t => t.name).join(', ');
                logger.info(`[X-PIPELINE] Top X trends for ${region}: ${names}`);
                
                // Log trend detection event
                if (this.pipeline && this.pipeline.stateManager) {
                    await this.pipeline.stateManager.logEvent('X_TRENDS_DETECTED', {
                        region: region,
                        champion: trendData.topic,
                        championVolume: trendData.volume,
                        confidence: trendData.confidence,
                        sources: trendData.sourcesUsed,
                        top5: trendData.topTrends,
                        sourceType: trendData.sourceType
                    });
                }
                
                await this._processTrends(trendData, region);
                logger.info(`[X-PIPELINE] X/Twitter pipeline complete for ${region}`);
            }
        } catch (error) {
            logger.error(`[X-PIPELINE] Error in X/Twitter pipeline for ${region}: ${error.message}`);
        }
    }

    /**
     * Check TikTok trends only
     * @param {string} region - Region name
     */
    async _checkTikTokTrends(region) {
        try {
            logger.info(`[TIKTOK-PIPELINE] Scanning TikTok trends for ${region}...`);
            const trendData = await trendDetector.detectTikTokTrends(region);
            if (trendData && trendData.topTrends) {
                const names = trendData.topTrends.map(t => t.name).join(', ');
                logger.info(`[TIKTOK-PIPELINE] Top TikTok trends for ${region}: ${names}`);
                
                // Log trend detection event
                if (this.pipeline && this.pipeline.stateManager) {
                    await this.pipeline.stateManager.logEvent('TIKTOK_TRENDS_DETECTED', {
                        region: region,
                        champion: trendData.topic,
                        championVolume: trendData.volume,
                        confidence: trendData.confidence,
                        sources: trendData.sourcesUsed,
                        top5: trendData.topTrends,
                        sourceType: trendData.sourceType
                    });
                }
                
                await this._processTrends(trendData, region);
                logger.info(`[TIKTOK-PIPELINE] TikTok pipeline complete for ${region}`);
            }
        } catch (error) {
            logger.error(`[TIKTOK-PIPELINE] Error in TikTok pipeline for ${region}: ${error.message}`);
        }
    }

    /**
     * Process trends for deployment or momentum
     * @param {Object} trendData - Trend data from detector
     * @param {string} region - Region name
     */
    async _processTrends(trendData, region) {
        if (!trendData || !trendData.topTrends) return;
        
        const sourceType = trendData.sourceType || 'UNKNOWN';
        logger.info(`[${sourceType}-PIPELINE] Processing ${trendData.topTrends.length} trends for ${region}...`);
        
        if (this.pipeline && this.pipeline.stateManager) {
            const momentumCalculator = require('./modules/momentumCalculator');
            const hre = require("hardhat");
            const { ethers } = hre;

            // Process each trend
            for (const t of trendData.topTrends) {
                try {
                    const deployment = await this.pipeline.stateManager.getDeploymentByTopic(t.name, region);
                    
                    if (deployment && deployment.token_address) {
                        // --- EXISTING TREND: INFLATE MOMENTUM ---
                        const previousVolume = await this.pipeline.stateManager.getLastSnapshotVolume(t.name, region);
                        if (previousVolume) {
                            const feeBreakdown = momentumCalculator.calculateAdditionalSupplyWithFee(t.volume, previousVolume);
                            
                            if (feeBreakdown.totalAdditional > 0) {
                                logger.info(`📈 [${sourceType}] Momentum surge for ${t.name}! Minting ${feeBreakdown.totalAdditional}...`);
                                
                                const signer = this.pipeline.orchestrator.signer;
                                const tokenContract = new ethers.Contract(
                                    deployment.token_address,
                                    ['function agentMint(uint256, address) external'],
                                    signer
                                );
                                
                                try {
                                    const creatorAddress = await signer.getAddress();
                                    const netSupplyWei = ethers.parseUnits(feeBreakdown.netAdditional.toString(), 18);
                                    const mintTx = await tokenContract.agentMint(netSupplyWei, creatorAddress);
                                    await mintTx.wait();
                                    
                                    let feeTxHash = null;
                                    if (feeBreakdown.creatorFee > 0) {
                                        const feeWei = ethers.parseUnits(feeBreakdown.creatorFee.toString(), 18);
                                        const feeTx = await tokenContract.agentMint(feeWei, creatorAddress);
                                        await feeTx.wait();
                                        feeTxHash = feeTx.hash;
                                        logger.info(`✅ [${sourceType}] Creator fee minted: ${feeBreakdown.creatorFee}`);
                                    }
                                    
                                    logger.info(`Minting successful. Injecting supply to pool...`);
                                    const injectTxHash = await this.pipeline.orchestrator.liquidityManager.injectSupplyToPool(
                                        deployment.token_address,
                                        feeBreakdown.netAdditional
                                    );
                                    
                                    logger.info(`✅ [${sourceType}] Successfully inflated Liquidity for ${t.name}`);
                                } catch (txErr) {
                                    logger.error(`❌ [${sourceType}] Tx failed for momentum (${t.name}): ${txErr.message}`);
                                }
                            }
                        }
                    } else {
                        // --- NEW TREND: DEPLOY TOKEN ---
                        logger.info(`✨ [${sourceType}] New Trend: "${t.name}". Triggering Deployment!`);
                        try {
                            // Attach sources to trend for source tracking in webhook
                            t.sources = trendData.sourcesUsed || [];
                            t.sourceType = sourceType;
                            await this.pipeline.execute(t, region);
                        } catch (deployErr) {
                            logger.error(`❌ [${sourceType}] Deployment failed for ${t.name}: ${deployErr.message}`);
                        }
                    }
                } catch (trendErr) {
                    logger.error(`❌ [${sourceType}] Error processing trend ${t.name}: ${trendErr.message}`);
                }
            }
        }
    }

}

module.exports = Scheduler;
