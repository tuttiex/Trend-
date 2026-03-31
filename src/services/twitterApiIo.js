const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class TwitterApiIo {
    constructor() {
        this.apiKey = config.twitter.twitterApiIoKey;
        // Standalone service URL
        this.baseUrl = 'https://api.twitterapi.io/twitter';

        // Credentials for posting (User Context)
        this.username = config.twitter.username;
        this.password = config.twitter.password;
        this.email = config.twitter.email;
        this.proxy = config.twitter.proxy;

        if (!this.apiKey) {
            logger.warn('TwitterAPI.io Key is missing in config!');
        }
    }

    async getTrends(woeid) {
        if (!this.apiKey) {
            throw new Error('TwitterAPI.io Key is not configured.');
        }

        const options = {
            method: 'GET',
            url: `${this.baseUrl}/trends`,
            params: { woeid: woeid },
            headers: {
                'X-API-Key': this.apiKey,
                'Accept': 'application/json'
            }
        };

        try {
            logger.info(`Fetching trends from twitterapi.io (Standalone) for WOEID: ${woeid}`);
            const response = await axios.request(options);
            
            // Standardize output for Fusion Brain
            const apiData = response.data;
            let results = [];

            if (Array.isArray(apiData) && apiData.length > 0) {
                results = apiData.map((t, index) => ({
                    name: t.name,
                    volume: t.tweet_volume || 0,
                    rank: index + 1
                }));
            } else if (apiData && apiData.trends && apiData.trends.length > 0) {
                results = apiData.trends.map((item, index) => ({
                    name: item.trend?.name || item.name,
                    volume: item.trend?.tweet_volume || item.tweet_volume || 0,
                    rank: item.trend?.rank || index + 1
                }));
            }

            return results;
        } catch (error) {
            logger.error('TwitterAPI.io Error:', error.message);
            return [];
        }
    }

    async postTweet(text) {
        if (!this.apiKey) {
            throw new Error('TwitterAPI.io Key is not configured.');
        }

        // To post, we first need to "login" to get a cookie, or use a cached one.
        // For simplicity, we'll try to login each time or TODO: implement caching.
        // We need username, password, email.
        if (!this.username || !this.password || !this.email) {
            throw new Error('TwitterAPI.io Posting requires User Credentials (username, password, email) in .env');
        }

        try {
            // 1. Login to get cookie
            logger.info(`Logging in to TwitterAPI.io as ${this.username}...`);
            const loginParams = {
                user_name: this.username,
                password: this.password,
                email: this.email
            };
            if (this.proxy) {
                loginParams.proxy = this.proxy;
            }
            // Add 2FA Secret if available (Highly recommended)
            if (config.twitter.totpSecret) {
                loginParams.totp_secret = config.twitter.totpSecret;
            } else {
                logger.warn('No 2FA Secret configured! Login might fail or trigger suspicious activity checks.');
            }

            const loginResponse = await axios.post(`${this.baseUrl}/user_login_v2`, loginParams, {
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            if (!loginResponse.data) {
                logger.error('Login Failed - No data returned:', loginResponse.data);
                throw new Error('Login to TwitterAPI.io failed.');
            }

            if (!loginResponse.data || !loginResponse.data.login_cookies) {
                logger.error('Login Failed - No login_cookies returned:', loginResponse.data);
                throw new Error('Login to TwitterAPI.io failed: Missing login_cookies');
            }

            // The API returns the cookie string directly in `login_cookies`
            const cookieString = loginResponse.data.login_cookies;

            logger.info(`Login successful. Got login_cookies (len: ${cookieString.length}): ${cookieString.substring(0, 50)}...`);

            // Rate Limit Delay for Free Tier (1 req / 5s)
            logger.info('Waiting 6 seconds to respect rate limit...');
            await new Promise(resolve => setTimeout(resolve, 6000));

            // 2. Post Tweet
            logger.info(`Posting tweet: "${text}"`);

            const tweetParams = {
                tweet_text: text,
                login_cookies: cookieString // Pass cookie string in body
            };

            if (this.proxy) {
                tweetParams.proxy = this.proxy;
            }

            const tweetResponse = await axios.post(`${this.baseUrl}/create_tweet_v2`, tweetParams, {
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });

            logger.info('Tweet posted response:', tweetResponse.data);
            return tweetResponse.data;

        } catch (error) {
            if (error.response) {
                logger.error('TwitterAPI.io Posting Error:', {
                    status: error.response.status,
                    data: error.response.data
                });
            } else {
                logger.error('TwitterAPI.io Posting specific error:', error.message);
            }
            throw error;
        }
    }
}

module.exports = new TwitterApiIo();
