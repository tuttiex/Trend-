const axios = require('axios');
const logger = require('../utils/logger');
require('dotenv').config();

class WebhookService {
    constructor() {
        this.url = process.env.WEBHOOK_URL;
    }

    /**
     * Sends deployment data to the configured webhook URL.
     * @param {Object} data - Deployment payload
     */
    async notify(data) {
        if (!this.url) {
            logger.warn('⚠️ Webhook Service: WEBHOOK_URL not configured. Skipping notification.');
            return;
        }

        try {
            logger.info(`🔗 Webhook Service: Sending notification to ${this.url}...`);

            const payload = {
                event: 'TOKEN_DEPLOYED',
                timestamp: new Date().toISOString(),
                data: {
                    topic: data.topic,
                    symbol: data.symbol,
                    tokenAddress: data.tokenAddress,
                    metadataCid: data.metadataCid,
                    imageCid: data.imageCid,
                    poolAddress: data.poolAddress,
                    liquidityTx: data.liquidityTx,
                    chainId: process.env.CHAIN_ID || 8453
                    // Add any other relevant fields for the trend$ website
                }
            };

            const response = await axios.post(this.url, payload, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Source': process.env.WEBHOOK_SECRET
                }
            });

            logger.info(`✅ Webhook Service: Notification successful. Status: ${response.status}`);
            return true;
        } catch (error) {
            const status = error.response ? error.response.status : 'N/A';
            logger.error(`❌ Webhook Service: Notification failed. Status: ${status}. Error: ${error.message}`);
            // We don't throw here to avoid breaking the main pipeline if the webhook is down
            return false;
        }
    }
}

module.exports = new WebhookService();
