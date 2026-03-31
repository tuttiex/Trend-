const { TwitterApi } = require('twitter-api-v2');
const config = require('../config/config');
const logger = require('../utils/logger');

class TwitterClient {
    constructor() {
        // Initialize with OAuth 1.0a (User Context) which is required for posting tweets typically
        if (config.twitter.apiKey && config.twitter.apiSecret && config.twitter.accessToken && config.twitter.accessSecret) {
            this.client = new TwitterApi({
                appKey: config.twitter.apiKey,
                appSecret: config.twitter.apiSecret,
                accessToken: config.twitter.accessToken,
                accessSecret: config.twitter.accessSecret,
            });
            this.rwClient = this.client.readWrite;
            logger.info('Twitter Client v2 initialized with OAuth 1.0a credentials.');
        } else {
            logger.warn('Twitter Client v2 missing credentials! Posting will fail.');
            this.client = null;
        }
    }

    async postTweet(text) {
        if (!this.client) {
            throw new Error('Twitter Client is not configured with valid credentials.');
        }

        try {
            logger.info(`Attempting to post tweet: "${text}"`);
            const response = await this.rwClient.v2.tweet(text);
            logger.info('Tweet posted successfully!', response);
            return response;
        } catch (error) {
            throw error;
        }
    }

    async getTrends(woeid) {
        if (!this.client) {
            throw new Error('Twitter Client is not configured with valid credentials.');
        }

        try {
            logger.info(`Fetching trends from X API v2 for WOEID: ${woeid}`);
            // Attempting the v2 endpoint mentioned by the user
            // We use the raw .get() since it might be a newer/beta endpoint
            const response = await this.client.get(`trends/by/woeid/${woeid}`);
            
            // Expected v2 format usually has a 'data' wrapper
            if (response && response.data) {
                return response.data;
            }
            return response;
        } catch (error) {
            logger.warn(`X API v2 Trends failed: ${error.message}. Falling back to v1.1 Trends API...`);
            try {
                // Trends is a v1.1 endpoint. The correct method name is trendsByPlace
                const trends = await this.client.v1.trendsByPlace(woeid);
                return trends;
            } catch (v1Error) {
                logger.error('Error fetching trends from official Twitter API (v2 & v1.1):', v1Error);
                throw v1Error;
            }
        }
    }
}

module.exports = new TwitterClient();
