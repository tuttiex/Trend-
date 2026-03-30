const trendScraper = require('../services/trendScraper');
const twitterApiIo = require('../services/twitterApiIo');
const twitterClient = require('../services/twitterClient');
const logger = require('../utils/logger');

// WOEID (Where On Earth ID)
const WOEID_NIGERIA = 23424908;
const WOEID_US = 23424977;

// Keywords to ignore (Daily generic trends that aren't good for news/tokens)
const BLACKLIST = [
    'BIBLE', 'JESUS', 'GOOD MORNING', 'HAPPY MONDAY', 'HAPPY TUESDAY',
    'HAPPY WEDNESDAY', 'HAPPY THURSDAY', 'HAPPY FRIDAY', 'HAPPY SATURDAY',
    'HAPPY SUNDAY', 'MEDITATION', 'PRAYER'
];

class TrendDetector {
    constructor() {
        logger.info('TrendDetector initialized with Smart Ranking & API Fallback');
    }

    async detectTrend(regionName) {
        let rawTrends = [];
        const woeid = this.getWOEID(regionName);

        // 1. Try OFFICIAL Twitter API First
        try {
            logger.info(`Attempting OFFICIAL Twitter API fetch for ${regionName}...`);
            const apiResponse = await twitterClient.getTrends(woeid);
            
            // v1.1 trendsByWoeid returns an array with one object [{ trends: [...] }]
            // v2 might return { trends: [...] } or { data: { trends: [...] } }
            let trendsList = null;
            if (Array.isArray(apiResponse) && apiResponse[0]?.trends) {
                trendsList = apiResponse[0].trends;
            } else if (apiResponse?.trends) {
                trendsList = apiResponse.trends;
            } else if (apiResponse?.data?.trends) {
                trendsList = apiResponse.data.trends;
            }

            if (trendsList && Array.isArray(trendsList)) {
                rawTrends = trendsList.map((t, index) => ({
                    name: t.name || t.trend_name,
                    volume: t.tweet_volume || t.volume || 0,
                    rank: index + 1
                }));
            }

            if (rawTrends.length > 0) {
                logger.info(`✅ Successfully got ${rawTrends.length} trends from OFFICIAL Twitter API for ${regionName}`);
            }
        } catch (e) {
            logger.warn(`⚠️ Official API failed: ${e.message}. Falling back to TwitterAPI.io.`);
        }

        // 2. Fallback to Professional API (TwitterAPI.io)
        if (rawTrends.length === 0) {
            try {
                logger.info(`Attempting TwitterAPI.io fetch for ${regionName}...`);
                const apiResponse = await twitterApiIo.getTrends(woeid);

                // Handle both old flat array format AND new nested object format
                if (Array.isArray(apiResponse) && apiResponse.length > 0) {
                    rawTrends = apiResponse.map((t, index) => ({
                        name: t.name,
                        volume: t.tweet_volume || 0,
                        rank: index + 1
                    }));
                } else if (apiResponse && apiResponse.trends && apiResponse.trends.length > 0) {
                    rawTrends = apiResponse.trends.map((item, index) => ({
                        name: item.trend?.name || item.name,
                        volume: item.trend?.tweet_volume || item.tweet_volume || 0,
                        rank: item.trend?.rank || index + 1
                    }));
                }

                if (rawTrends.length > 0) {
                    logger.info(`✅ Successfully got ${rawTrends.length} trends from TwitterAPI.io for ${regionName}`);
                }
            } catch (e) {
                logger.warn(`⚠️ TwitterAPI.io failed: ${e.message}. Falling back to Web Scraper.`);
            }
        }

        // 3. Fallback to Web Scraper (getdaytrends.com) — LAST RESORT
        if (rawTrends.length === 0) {
            try {
                let scraperRegion = 'world';
                if (woeid === 23424908) scraperRegion = 'nigeria';
                if (woeid === 23424977) scraperRegion = 'united-states';

                logger.info(`Scraping trends from getdaytrends.com for ${regionName}...`);
                const scraped = await trendScraper.getTrends(scraperRegion);
                rawTrends = scraped.map((t, index) => ({
                    name: t.name,
                    volume: t.tweet_volume || 0,
                    rank: index + 1
                }));
                if (rawTrends.length > 0) {
                    logger.info(`✅ Successfully scraped ${rawTrends.length} trends for ${regionName}`);
                }
            } catch (e) {
                logger.error(`❌ All trend sources failed (Official, TwitterAPI.io, and Scraper): ${e.message}`);
                throw new Error('All trend sources failed.');
            }
        }

        // 3. Smart Filtering & Ranking
        const filteredTrends = rawTrends.filter(t => {
            const isBlacklisted = BLACKLIST.some(word => t.name.toUpperCase().includes(word));
            return t.name && !isBlacklisted;
        });

        if (filteredTrends.length === 0) return null;

        // SMART RANKING: 
        // We trust the SOURCE RANK (index in list) 70% and VOLUME 30%.
        // This ensures a breaking news story at #1 wins over a high-volume steady trend at #10.
        filteredTrends.sort((a, b) => {
            // Lower rank is better (1 is best). 
            // We give a 'bonus' to high volume, but rank is the primary driver.
            const scoreA = a.rank + (a.volume > 100000 ? -2 : 0);
            const scoreB = b.rank + (b.volume > 100000 ? -2 : 0);
            return scoreA - scoreB;
        });

        const primaryTrend = filteredTrends[0];
        const top5 = filteredTrends.slice(0, 5).map(t => ({ name: t.name, volume: t.volume, rank: t.rank }));

        return {
            region: regionName,
            topic: primaryTrend.name,
            volume: primaryTrend.volume,
            topTrends: top5,
            confidence: this.calculateConfidence(primaryTrend.volume),
            timestamp: new Date().toISOString()
        };
    }

    getWOEID(region) {
        const normalized = region.toLowerCase();
        if (normalized === 'nigeria') return WOEID_NIGERIA;
        if (normalized === 'us' || normalized === 'united states') return WOEID_US;
        return null;
    }

    calculateConfidence(volume) {
        if (volume > 100000) return 0.95;
        if (volume > 50000) return 0.90;
        if (volume > 20000) return 0.85;
        if (volume > 10000) return 0.80;
        return 0.60;
    }
}

module.exports = new TrendDetector();
