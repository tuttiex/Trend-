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
            logger.error('Error posting tweet:', error);
            throw error;
        }
    }
}

module.exports = new TwitterClient();
