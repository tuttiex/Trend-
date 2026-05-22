const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * TikTok Service using RapidAPI
 * Fetches trending posts and extracts hashtags
 * Cached to limit API calls (2 hour TTL)
 */
class TikTokService {
    constructor() {
        this.rapidApiKey = process.env.RAPIDAPI_KEY || config.tiktok?.rapidApiKey;
        this.baseUrl = 'https://tiktok-api23.p.rapidapi.com';

        // Cache: region -> { data, timestamp }
        this.cache = new Map();
        this.CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

        if (!this.rapidApiKey) {
            logger.warn('TikTok: RAPIDAPI_KEY not configured!');
        }
    }

    /**
     * Get trending hashtags by searching for popular terms and aggregating results
     * Cached: only fetches from Apify once per 60 minutes per region
     * @param {string} region - 'US' or 'NG' (Nigeria)
     * @returns {Promise<Array<{name: string, volume: number, rank: number}>>}
     */
    async getTrends(region) {
        if (!this.rapidApiKey) {
            throw new Error('TikTok: RAPIDAPI_KEY not configured');
        }

        // Check cache first
        const cached = this.cache.get(region);
        const now = Date.now();
        if (cached && (now - cached.timestamp) < this.CACHE_TTL_MS) {
            logger.info(`TikTok: Returning cached trends for ${region} (${Math.round((now - cached.timestamp) / 60000)} mins old)`);
            return cached.data;
        }

        logger.info(`TikTok: Fetching fresh trends for region ${region}`);

        try {
            // Call RapidAPI to get trending posts
            const posts = await this.getTrendingPosts();

            if (!posts || posts.length === 0) {
                logger.warn('TikTok: No posts returned from RapidAPI');
                return [];
            }

            // Extract hashtags from posts
            const trends = this.extractHashtagsFromPosts(posts);

            if (trends.length === 0) {
                logger.warn('TikTok: No hashtags found in trending posts');
                return [];
            }

            // Store in cache
            this.cache.set(region, {
                data: trends,
                timestamp: Date.now()
            });

            logger.info(`TikTok: Found ${trends.length} trending hashtags (cached for 60 mins)`);
            return trends;

        } catch (error) {
            logger.error(`TikTok: Error fetching trends: ${error.message}`);
            return [];
        }
    }

    /**
     * Get trending posts from RapidAPI
     * @returns {Promise<Array>} Array of post objects
     */
    async getTrendingPosts() {
        const url = `${this.baseUrl}/api/post/trending?count=20`;
        logger.info(`TikTok: Fetching trending posts from RapidAPI...`);

        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
                'x-rapidapi-key': this.rapidApiKey
            }
        });

        const posts = response.data?.itemList || [];
        logger.info(`TikTok: Received ${posts.length} posts from RapidAPI`);
        return posts;
    }

    /**
     * Extract hashtags from posts and convert to trend format
     * @param {Array} posts - Array of post objects from RapidAPI
     * @returns {Array} Array of trend objects {name, volume, rank}
     */
    extractHashtagsFromPosts(posts) {
        const hashtagMap = new Map();

        posts.forEach(post => {
            const playCount = post.stats?.playCount || 0;

            // Extract hashtags from challenges array
            const challenges = post.challenges || [];
            challenges.forEach(challenge => {
                const name = challenge.title;
                if (!name) return;

                const normalizedName = name.toLowerCase();

                if (!hashtagMap.has(normalizedName)) {
                    hashtagMap.set(normalizedName, {
                        playCount: 0,
                        count: 0
                    });
                }

                const stats = hashtagMap.get(normalizedName);
                stats.playCount += playCount;
                stats.count += 1;
            });

            // Extract hashtags from textExtra array
            const textExtra = post.textExtra || [];
            textExtra.forEach(item => {
                const name = item.hashtagName;
                if (!name) return;

                const normalizedName = name.toLowerCase();

                if (!hashtagMap.has(normalizedName)) {
                    hashtagMap.set(normalizedName, {
                        playCount: 0,
                        count: 0
                    });
                }

                const stats = hashtagMap.get(normalizedName);
                stats.playCount += playCount;
                stats.count += 1;
            });
        });

        // Convert to trend format and sort by volume
        const trends = Array.from(hashtagMap.entries())
            .map(([name, stats], index) => ({
                name: `#${name}`,
                volume: stats.playCount,
                rank: index + 1
            }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 50);

        return trends;
    }


    /**
     * Get cache age for a region
     * @param {string} region - Region name
     * @returns {number|null} Cache age in milliseconds, or null if no cache
     */
    getCacheAge(region) {
        const cached = this.cache.get(region);
        if (!cached) return null;
        return Date.now() - cached.timestamp;
    }

    /**
     * Check if cache is fresh for a region
     * @param {string} region - Region name
     * @returns {boolean} True if cache is fresh (< 60 mins)
     */
    isCacheFresh(region) {
        const age = this.getCacheAge(region);
        if (age === null) return false;
        return age < this.CACHE_TTL_MS;
    }
}

module.exports = new TikTokService();
