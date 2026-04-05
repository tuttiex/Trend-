const trendDetector = require('./modules/trendDetection');
const logger = require('./utils/logger');

class Scheduler {
    constructor(pipeline) {
        this.pipeline = pipeline;
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
            logger.info(`[Monitoring] Scanning trends for ${region}...`);
            const trendData = await trendDetector.detectTrend(region);
            if (trendData && trendData.topTrends) {
                const names = trendData.topTrends.map(t => t.name).join(', ');
                logger.info(`[Monitoring] Top trends for ${region}: ${names}`);
                
                // Log trend detection event
                if (this.pipeline && this.pipeline.stateManager) {
                    await this.pipeline.stateManager.logEvent('TRENDS_DETECTED', {
                        region: region,
                        champion: trendData.topic,
                        championVolume: trendData.volume,
                        confidence: trendData.confidence,
                        sources: trendData.sourcesUsed,
                        top5: trendData.topTrends
                    });
                }
                
                if (this.pipeline && this.pipeline.stateManager) {
                    const momentumCalculator = require('./modules/momentumCalculator');
                    const hre = require("hardhat");
                    const { ethers } = hre;

                    // Agent V2 Loop: Dynamically handle both initial deployments AND momentum inflation
                    for (const t of trendData.topTrends) {
                        try {
                            const deployment = await this.pipeline.stateManager.getDeploymentByTopic(t.name, region);
                            
                            if (deployment && deployment.token_address) {
                                // --- EXISTING TREND: INFLATE MOMENTUM ---
                                const previousVolume = await this.pipeline.stateManager.getLastSnapshotVolume(t.name, region);
                                if (previousVolume) {
                                    const additionalSupply = momentumCalculator.calculateAdditionalSupply(t.volume, previousVolume);
                                    
                                    if (additionalSupply > 0) {
                                        logger.info(`📈 Momentum surge detected for ${t.name}! Minting ${additionalSupply} new tokens...`);
                                        
                                        const signer = this.pipeline.orchestrator.signer;
                                        const tokenContract = new ethers.Contract(
                                            deployment.token_address,
                                            ['function agentMint(uint256) external'],
                                            signer
                                        );
                                        
                                        const supplyWei = ethers.parseUnits(additionalSupply.toString(), 18);
                                        
                                        try {
                                            const mintTx = await tokenContract.agentMint(supplyWei);
                                            await mintTx.wait();
                                            
                                            // Log momentum mint
                                            await this.pipeline.stateManager.logEvent('MOMENTUM_MINT', {
                                                topic: t.name,
                                                region: region,
                                                tokenAddress: deployment.token_address,
                                                previousVolume: previousVolume,
                                                newVolume: t.volume,
                                                additionalSupply: additionalSupply,
                                                txHash: mintTx.hash
                                            });
                                            
                                            logger.info(`Minting successful. Injecting supply to liquidity pool...`);
                                            await this.pipeline.orchestrator.liquidityManager.injectSupplyToPool(
                                                deployment.token_address, 
                                                additionalSupply
                                            );
                                            
                                            // Log liquidity injection
                                            await this.pipeline.stateManager.logEvent('LIQUIDITY_INJECTED', {
                                                topic: t.name,
                                                region: region,
                                                tokenAddress: deployment.token_address,
                                                injectedSupply: additionalSupply
                                            });
                                            
                                            logger.info(`✅ Successfully inflated paired Liquidity for ${t.name}`);
                                        } catch (txErr) {
                                            logger.error(`❌ Tx failed for momentum minting (${t.name}): ${txErr.message}`);
                                            
                                            // Log momentum mint error
                                            await this.pipeline.stateManager.logEvent('MOMENTUM_MINT_ERROR', {
                                                topic: t.name,
                                                region: region,
                                                tokenAddress: deployment.token_address,
                                                error: txErr.message,
                                                attemptedSupply: additionalSupply
                                            });
                                        }
                                    }
                                }
                            } else {
                                // --- NEW TREND: DEPLOY TOKEN IMMEDIATELY ---
                                logger.info(`✨ AGENT V2: New Viral Trend Discovered - "${t.name}". Triggering Deployment Pipeline!`);
                                try {
                                    await this.pipeline.execute(t, region);
                                } catch (deployErr) {
                                    logger.error(`❌ Deployment failed for ${t.name}: ${deployErr.message}`);
                                }
                            }
                        } catch (err) {
                            logger.error(`Error processing trend ${t.name}: ${err.message}`);
                        }
                    }

                    // --- Persist the snapshot ---
                    await this.pipeline.stateManager.saveTrendSnapshot(trendData);
                }
            }
        } catch (error) {
            logger.error(`[Monitoring] Error detecting trends for ${region}: ${error.message}`);
        }
    }
}

module.exports = Scheduler;
