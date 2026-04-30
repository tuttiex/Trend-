const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * TikTok Service using Apify TikTok Scraper
 * Fetches trending hashtags and aggregates video metrics
 * Cached to limit API calls (60 minute TTL)
 */
class TikTokService {
    constructor() {
        this.apifyToken = config.tiktok?.apifyToken;
        this.baseUrl = 'https://api.apify.com/v2';

        // Apify TikTok Scraper Actor ID
        this.actorId = 'clockworks/tiktok-scraper';

        // Cache: region -> { data, timestamp }
        this.cache = new Map();
        this.CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

        if (!this.apifyToken) {
            logger.warn('TikTok: APIFY_TOKEN not configured!');
        }
    }

    /**
     * Get trending hashtags by searching for popular terms and aggregating results
     * Cached: only fetches from Apify once per 60 minutes per region
     * @param {string} region - 'US' or 'NG' (Nigeria)
     * @returns {Promise<Array<{name: string, volume: number, rank: number}>>}
     */
    async getTrends(region) {
        if (!this.apifyToken) {
            throw new Error('TikTok: APIFY_TOKEN not configured');
        }

        // Check cache first
        const cached = this.cache.get(region);
        const now = Date.now();
        if (cached && (now - cached.timestamp) < this.CACHE_TTL_MS) {
            logger.info(`TikTok: Returning cached trends for ${region} (${Math.round((now - cached.timestamp) / 60000)} mins old)`);
            return cached.data;
        }

        const proxyCountry = this.getProxyCountry(region);
        logger.info(`TikTok: Fetching fresh trends for region ${region} (proxy: ${proxyCountry})`);

        try {
            // Run Apify Actor to get trending content
            const videos = await this.runTikTokScraper(proxyCountry);

            if (!videos || videos.length === 0) {
                logger.warn('TikTok: No videos returned from scraper');
                return [];
            }

            // Aggregate by hashtag
            const hashtagStats = this.aggregateByHashtag(videos);

            // Convert to trend format
            const trends = Array.from(hashtagStats.entries())
                .map(([name, stats], index) => ({
                    name: `#${name}`,
                    volume: stats.playCount,
                    rank: index + 1
                }))
                .sort((a, b) => b.volume - a.volume)
                .slice(0, 50);

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
     * Run TikTok Scraper Actor on Apify
     * @param {string} proxyCountry - Proxy country code
     * @returns {Promise<Array>} Array of video objects
     */
    async runTikTokScraper(proxyCountry) {
        const input = {
            hashtags: [],
            resultsPerPage: 100,
            proxyCountryCode: proxyCountry,
            excludePinnedPosts: false,
            scrapeRelatedVideos: true,
            shouldDownloadVideos: false,
            shouldDownloadAvatars: false,
            shouldDownloadCovers: false
        };

        // Start actor run
        const startUrl = `${this.baseUrl}/acts/${this.actorId}/runs`;
        logger.info(`TikTok: Starting Apify actor run...`);

        const startResponse = await axios.post(startUrl, { input }, {
            headers: {
                'Authorization': `Bearer ${this.apifyToken}`,
                'Content-Type': 'application/json'
            }
        });

        const runId = startResponse.data.data.id;
        logger.info(`TikTok: Actor run started, ID: ${runId}`);

        // Wait for run to complete (with timeout)
        const timeout = 120000; // 2 minutes
        const startTime = Date.now();

        while (true) {
            const statusUrl = `${this.baseUrl}/acts/${this.actorId}/runs/${runId}`;
            const statusResponse = await axios.get(statusUrl, {
                headers: { 'Authorization': `Bearer ${this.apifyToken}` }
            });

            const status = statusResponse.data.data.status;

            if (status === 'SUCCEEDED') {
                logger.info('TikTok: Actor run completed successfully');
                break;
            }

            if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
                throw new Error(`TikTok: Actor run ${status}`);
            }

            if (Date.now() - startTime > timeout) {
                throw new Error('TikTok: Actor run timeout');
            }

            logger.info(`TikTok: Waiting for run to complete (status: ${status})...`);
            await new Promise(r => setTimeout(r, 5000)); // Poll every 5 seconds
        }

        // Fetch dataset items
        const datasetId = startResponse.data.data.defaultDatasetId;
        const datasetUrl = `${this.baseUrl}/datasets/${datasetId}/items`;

        const datasetResponse = await axios.get(datasetUrl, {
            headers: { 'Authorization': `Bearer ${this.apifyToken}` },
            params: { clean: true, format: 'json' }
        });

        return datasetResponse.data || [];
    }

    /**
     * Aggregate video data by hashtag
     * @param {Array} videos - Array of video objects from Apify
     * @returns {Map} Map of hashtag -> { playCount, diggCount, shareCount }
     */
    aggregateByHashtag(videos) {
        const hashtagMap = new Map();

        videos.forEach(video => {
            const hashtags = video.hashtags || [];

            hashtags.forEach(tag => {
                const name = tag.name || tag;
                if (!name) return;

                const normalizedName = name.toLowerCase();

                if (!hashtagMap.has(normalizedName)) {
                    hashtagMap.set(normalizedName, {
                        playCount: 0,
                        diggCount: 0,
                        shareCount: 0,
                        count: 0
                    });
                }

                const stats = hashtagMap.get(normalizedName);
                stats.playCount += video.playCount || 0;
                stats.diggCount += video.diggCount || 0;
                stats.shareCount += video.shareCount || 0;
                stats.count += 1;
            });
        });

        // Sort by playCount and return top 50
        const sorted = Array.from(hashtagMap.entries())
            .sort((a, b) => b[1].playCount - a[1].playCount)
            .slice(0, 50);

        return new Map(sorted);
    }

    /**
     * Map region to proxy country code
     * @param {string} region - Region name
     * @returns {string} Proxy country code
     */
    getProxyCountry(region) {
        const normalized = region.toLowerCase();
        if (normalized === 'nigeria' || normalized === 'ng') return 'NG';
        if (normalized === 'us' || normalized === 'united states') return 'US';
        return 'US'; // Default to US
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
