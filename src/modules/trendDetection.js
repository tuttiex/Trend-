const trendScraper = require('../services/trendScraper');
const twitterApiIo = require('../services/twitterApiIo');
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

        // 1. Try Professional API (TwitterAPI.io) First
        try {
            logger.info(`Attempting API fetch for ${regionName}...`);
            const apiResponse = await twitterApiIo.getTrends(woeid);
            // Format: API usually returns [{ name: '...', tweet_volume: ... }, ...]
            if (apiResponse && apiResponse.length > 0) {
                rawTrends = apiResponse.map((t, index) => ({
                    name: t.name,
                    volume: t.tweet_volume || 0,
                    rank: index + 1 // Preserve the API's own ranking
                }));
                logger.info(`✅ Successfully got ${rawTrends.length} trends from TwitterAPI.io for ${regionName}`);
            }
        } catch (e) {
            logger.warn(`⚠️ TwitterAPI.io failed: ${e.message}. Falling back to Scraper.`);
        }

        // 2. Fallback to Web Scraper if API failed or returned nothing
        if (rawTrends.length === 0) {
            try {
                let scraperRegion = 'world';
                if (woeid === 23424908) scraperRegion = 'nigeria';
                if (woeid === 23424977) scraperRegion = 'united-states';

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
                logger.error(`❌ Both API and Scraper failed: ${e.message}`);
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
        const top3 = filteredTrends.slice(0, 3).map(t => ({ name: t.name, volume: t.volume }));

        return {
            region: regionName,
            topic: primaryTrend.name,
            volume: primaryTrend.volume,
            topTrends: top3,
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
