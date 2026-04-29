const axios = require('axios');
const hre = require('hardhat');
const config = require('../config/config');
const logger = require('../utils/logger');

// BondingCurveDEX ABI (with swap events)
const DEX_ABI = [
    "function getPoolInfo() external view returns (uint256 tokenReserve, uint256 ethReserve, uint256 k, uint256 swapFeeBps, uint256 totalFeesCollected, uint256 price)",
    "event TokensPurchased(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 fee)",
    "event TokensSold(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 fee)"
];

class PriceSyncService {
    constructor(provider) {
        this.provider = provider;
        this.websiteUrl = config.website?.url;
        this.apiSecret = config.website?.apiSecret;
        this.lastSyncTime = {};
        this.eventListeners = new Map(); // Track active listeners per pool
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

    /**
     * Start listening for swap events on all deployed tokens
     * @param {Array} deployments - Array of deployment objects
     */
    async startEventListeners(deployments) {
        if (!this.websiteUrl) {
            logger.warn('PriceSync: WEBSITE_URL not configured, skipping event listeners');
            return;
        }

        logger.info(`PriceSync: Starting event listeners for ${deployments.length} tokens`);

        for (const deployment of deployments) {
            const { pool_address, token_symbol, token_address } = deployment;
            
            if (!pool_address || this.eventListeners.has(pool_address)) {
                continue; // Skip if no pool or already listening
            }

            try {
                await this.setupEventListener(deployment);
            } catch (error) {
                logger.error(`PriceSync: Failed to setup listener for ${token_symbol}: ${error.message}`);
            }
        }
    }

    /**
     * Setup event listener for a single DEX
     * @param {Object} deployment - Deployment object
     */
    async setupEventListener(deployment) {
        const { pool_address, token_symbol, token_address } = deployment;
        
        const dex = new hre.ethers.Contract(pool_address, DEX_ABI, this.provider);
        
        // Listen for buy events
        dex.on('TokensPurchased', async (buyer, ethIn, tokensOut, fee, event) => {
            try {
                const price = Number(hre.ethers.formatEther(ethIn)) / Number(hre.ethers.formatUnits(tokensOut, 18));
                
                logger.info(`PriceSync: Buy detected on ${token_symbol} - ${hre.ethers.formatEther(ethIn)} ETH, ${hre.ethers.formatUnits(tokensOut, 18)} tokens`);
                
                await this.sendTrade({
                    tokenAddress: token_address,
                    poolAddress: pool_address,
                    type: 'buy',
                    buyer: buyer,
                    ethAmount: hre.ethers.formatEther(ethIn),
                    tokenAmount: hre.ethers.formatUnits(tokensOut, 18),
                    fee: hre.ethers.formatEther(fee),
                    price: price.toString(),
                    txHash: event.log.transactionHash,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error(`PriceSync: Error processing buy event for ${token_symbol}: ${error.message}`);
            }
        });

        // Listen for sell events
        dex.on('TokensSold', async (seller, tokensIn, ethOut, fee, event) => {
            try {
                const price = Number(hre.ethers.formatEther(ethOut)) / Number(hre.ethers.formatUnits(tokensIn, 18));
                
                logger.info(`PriceSync: Sell detected on ${token_symbol} - ${hre.ethers.formatEther(ethOut)} ETH, ${hre.ethers.formatUnits(tokensIn, 18)} tokens`);
                
                await this.sendTrade({
                    tokenAddress: token_address,
                    poolAddress: pool_address,
                    type: 'sell',
                    seller: seller,
                    ethAmount: hre.ethers.formatEther(ethOut),
                    tokenAmount: hre.ethers.formatUnits(tokensIn, 18),
                    fee: hre.ethers.formatEther(fee),
                    price: price.toString(),
                    txHash: event.log.transactionHash,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error(`PriceSync: Error processing sell event for ${token_symbol}: ${error.message}`);
            }
        });

        this.eventListeners.set(pool_address, dex);
        logger.info(`PriceSync: Event listener started for ${token_symbol} at ${pool_address}`);
    }

    /**
     * Send trade data to website API
     * @param {Object} trade - Trade data
     */
    async sendTrade(trade) {
        const url = `${this.websiteUrl}/api/trade`;
        
        try {
            const response = await axios.post(url, trade, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Source': 'trends-agent',
                    'X-Secret': this.apiSecret || 'trends-agent-secret'
                }
            });
            
            logger.info(`PriceSync: Sent trade for ${trade.tokenAddress} - Status: ${response.status}`);
        } catch (error) {
            const status = error.response?.status || 'N/A';
            logger.error(`PriceSync: Failed to send trade - Status: ${status}, Error: ${error.message}`);
        }
    }

    /**
     * Stop all event listeners
     */
    stopAllListeners() {
        for (const [poolAddress, contract] of this.eventListeners) {
            contract.removeAllListeners();
            logger.info(`PriceSync: Stopped listener for ${poolAddress}`);
        }
        this.eventListeners.clear();
    }
}

module.exports = PriceSyncService;
