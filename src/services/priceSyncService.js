const axios = require('axios');
const hre = require('hardhat');
const config = require('../config/config');
const logger = require('../utils/logger');

// BondingCurveDEX ABI (minimal for price queries)
const DEX_ABI = [
    "function getPoolInfo() external view returns (uint256 tokenReserve, uint256 ethReserve, uint256 k, uint256 swapFeeBps, uint256 totalFeesCollected, uint256 price)"
];

class PriceSyncService {
    constructor(provider) {
        this.provider = provider;
        this.websiteUrl = config.website?.url;
        this.apiSecret = config.website?.apiSecret;
        this.lastSyncTime = {};
    }

    /**
     * Sync price snapshots for all deployed tokens
     * @param {Array} deployments - Array of deployment objects with token_address and pool_address
     */
    async syncAllPrices(deployments) {
        if (!this.websiteUrl) {
            logger.warn('PriceSync: WEBSITE_URL not configured, skipping price sync');
            return;
        }

        logger.info(`PriceSync: Starting price sync for ${deployments.length} tokens`);
        
        for (const deployment of deployments) {
            try {
                await this.syncTokenPrice(deployment);
            } catch (error) {
                logger.error(`PriceSync: Failed to sync ${deployment.token_symbol}: ${error.message}`);
            }
        }
        
        logger.info('PriceSync: Completed price sync cycle');
    }

    /**
     * Sync price for a single token
     * @param {Object} deployment - Deployment object with token_address and pool_address
     */
    async syncTokenPrice(deployment) {
        const { token_address, pool_address, token_symbol } = deployment;
        
        if (!pool_address) {
            logger.warn(`PriceSync: No pool address for ${token_symbol}, skipping`);
            return;
        }

        // Check if we should sync (minimum 5 minutes between syncs)
        const lastSync = this.lastSyncTime[token_address] || 0;
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (now - lastSync < fiveMinutes) {
            return; // Too soon
        }

        // Query DEX for pool info
        const dex = new hre.ethers.Contract(pool_address, DEX_ABI, this.provider);
        const poolInfo = await dex.getPoolInfo();
        
        const priceEth = hre.ethers.formatEther(poolInfo.price);
        const ethReserve = hre.ethers.formatEther(poolInfo.ethReserve);
        const tokenReserve = hre.ethers.formatUnits(poolInfo.tokenReserve, 18);
        
        logger.info(`PriceSync: ${token_symbol} - Price: ${priceEth} ETH, Reserve: ${ethReserve} ETH`);

        // Send to website API
        await this.sendPriceSnapshot({
            tokenAddress: token_address,
            poolAddress: pool_address,
            price_eth: priceEth,
            eth_reserve: ethReserve,
            token_reserve: tokenReserve,
            volume_eth: "0", // Placeholder - volume tracking requires event parsing
            symbol: token_symbol
        });

        this.lastSyncTime[token_address] = now;
    }

    /**
     * Send price snapshot to website API
     * @param {Object} snapshot - Price snapshot data
     */
    async sendPriceSnapshot(snapshot) {
        const url = `${this.websiteUrl}/api/price-snapshot`;
        
        try {
            const response = await axios.post(url, snapshot, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Source': 'trends-agent',
                    'X-Secret': this.apiSecret || 'trends-agent-secret'
                }
            });
            
            logger.info(`PriceSync: Sent snapshot for ${snapshot.symbol} - Status: ${response.status}`);
        } catch (error) {
            const status = error.response?.status || 'N/A';
            logger.error(`PriceSync: Failed to send snapshot for ${snapshot.symbol} - Status: ${status}, Error: ${error.message}`);
        }
    }
}

module.exports = PriceSyncService;
