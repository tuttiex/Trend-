const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class TweetApiCom {
    constructor() {
        this.apiKey = process.env.TWEETAPI_KEY;
        this.authToken = process.env.TWITTER_AUTH_TOKEN; // Cookie "auth_token"
        this.baseUrl = 'https://api.tweetapi.com';
        this.proxyConfig = process.env.TWITTER_PROXY; // Expected http://user:pass@host:port or similar

        if (!this.apiKey) {
            logger.warn('TweetAPI.com Key (TWEETAPI_KEY) is missing in .env!');
        }
        if (!this.authToken) {
            logger.warn('Twitter Auth Token (TWITTER_AUTH_TOKEN) is missing in .env!');
        }
    }

    // Helper to convert standard proxy string to TweetAPI format: hostname:port@username:password
    formatProxy(proxyString) {
        if (!proxyString) return null;

        try {
            // Remove http:// or https://
            let clean = proxyString.replace(/^https?:\/\//, '');

            // Check if it has auth
            if (clean.includes('@')) {
                const [auth, host] = clean.split('@');
                const [user, pass] = auth.split(':');
                return `${host}@${user}:${pass}`;
            } else {
                // No auth (IP based) - Docs say format hostname:port@username:password.
                // If IP auth, usually username:password are empty or ignored?
                // Let's assume just host:port might work or we need dummy auth?
                // Returning as is (host:port) to see if it works, or appending :@ if strictly parsed.
                return clean;
            }
        } catch (e) {
            logger.error('Failed to format proxy string:', e.message);
            return proxyString;
        }
    }

    async postTweet(text) {
        if (!this.apiKey || !this.authToken) {
            throw new Error('TweetAPI.com requires TWEETAPI_KEY and TWITTER_AUTH_TOKEN in .env');
        }

        if (!this.proxyConfig) {
            logger.warn('No Proxy provided for TweetAPI.com. Using service default (may have lower success rate).');
        }

        const formattedProxy = this.formatProxy(this.proxyConfig);
        if (formattedProxy) {
            logger.info(`Formatted Proxy for TweetAPI: ${formattedProxy}`);
        } else {
            logger.info('Using TweetAPI.com without custom proxy.');
        }

        const body = {
            authToken: this.authToken,
            text: text
        };

        if (formattedProxy) {
            body.proxy = formattedProxy;
        }

        try {
            logger.info(`Posting tweet via TweetAPI.com: "${text}"`);

            const response = await axios.post(`${this.baseUrl}/tw-v2/interaction/create-post`, body, {
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            logger.info('Tweet posted successfully via TweetAPI.com!', response.data);
            return response.data;

        } catch (error) {
            if (error.response) {
                logger.error('TweetAPI.com Posting Error:', {
                    status: error.response.status,
                    data: error.response.data
                });
            } else {
                logger.error('TweetAPI.com Network Error:', error.message);
            }
            throw error;
        }
    }

    // "Main way to get trends" as per user suggestion (via Search or Trends endpoint)
    // We will try the standard Trends endpoint first.
    async getTrends(woeid) {
        if (!this.apiKey) {
            throw new Error('TweetAPI.com Key is not configured.');
        }

        // Likely pattern based on v2 base URL
        const url = `${this.baseUrl}/tw-v2/trends/place`;

        try {
            logger.info(`Fetching trends from TweetAPI.com for WOEID: ${woeid}`);
            const response = await axios.get(url, {
                params: { id: woeid },
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            logger.info('TweetAPI.com Trends fetched successfully.');
            return response.data;
        } catch (error) {
            // If 404/403, it might not exist.
            logger.error('TweetAPI.com Trends Error:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    async search(query) {
        if (!this.apiKey) {
            throw new Error('TweetAPI.com Key is not configured.');
        }

        const url = `${this.baseUrl}/tw-v2/search`;
        try {
            logger.info(`Searching TweetAPI.com for: "${query}"`);
            const response = await axios.get(url, {
                params: {
                    query: query,
                    type: 'Latest'
                },
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            logger.error('TweetAPI.com Search Error:', error.response ? error.response.data : error.message);
            throw error;
        }
    }
}

module.exports = TweetApiCom;
