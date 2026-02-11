const trendScraper = require('../services/trendScraper');
const logger = require('../utils/logger');

// WOEID (Where On Earth ID)
const WOEID_NIGERIA = 23424908;
const WOEID_US = 23424977;

class TrendDetector {
    constructor() {
        logger.info('TrendDetector initialized for regions: Nigeria, US');
    }

    async detectTrend(regionName) {
        try {
            const woeid = this.getWOEID(regionName);
            if (!woeid) {
                throw new Error(`Invalid region: ${regionName}`);
            }

            logger.info(`Fetching trends for ${regionName} (WOEID: ${woeid})...`);

            // 1. Try Web Scraper (Primary)
            let rawTrends = [];
            try {
                // Map WOEID back to region name string for scraper
                // Logic: 23424908 -> 'nigeria', 23424977 -> 'united-states'

                let scraperRegion = 'world';
                if (woeid === 23424908) scraperRegion = 'nigeria';
                if (woeid === 23424977) scraperRegion = 'united-states';

                rawTrends = await trendScraper.getTrends(scraperRegion);

                if (rawTrends.length > 0) {
                    logger.info(`Successfully scraped trends for ${regionName} (${rawTrends.length} found)`);
                }
            } catch (e) {
                logger.warn(`TrendScraper failed for ${regionName}: ${e.message}.`);
            }

            if (rawTrends.length === 0) {
                throw new Error('No trend data returned from Scraper');
            }

            // Sort and get top 3
            // Valid trends must have a name. We try to prioritize volume if available.
            const validTrends = rawTrends.filter(t => t.name);

            // Sort by volume (descending)
            // Note: Scraper defaults unknown/low volume to 0 or 9000, so this works.
            validTrends.sort((a, b) => b.tweet_volume - a.tweet_volume);

            const top3 = validTrends.slice(0, 3).map(t => ({
                name: t.name,
                volume: t.tweet_volume
            }));

            if (top3.length === 0) {
                logger.warn(`No valid trends found for ${regionName}`);
                return null;
            }

            const primaryTrend = top3[0];

            return {
                region: regionName,
                topic: primaryTrend.name,
                volume: primaryTrend.volume,
                topTrends: top3, // Top 3 list [ {name, volume}, ... ]
                confidence: this.calculateConfidence(primaryTrend.volume),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error(`Error detecting trend for ${regionName}:`, error.message);
            throw error;
        }
    }

    getWOEID(region) {
        const normalized = region.toLowerCase();
        if (normalized === 'nigeria') return WOEID_NIGERIA;
        if (normalized === 'us' || normalized === 'united states') return WOEID_US;
        return null;
    }

    rankAndSelectTrend(trends) {
        // Filter out bad data but keep trends even if volume is null
        // RapidAPI/TwitterAPI.io often returns null volume but the list is pre-ranked by popularity.
        const validTrends = trends.filter(t => t.name);

        if (validTrends.length === 0) {
            return null;
        }

        // Since the API returns them in ranked order (usually), the first one is the top trend.
        // If volume is present, we prefer high volume, but if all are null, we take the first.

        // Let's try to find one with volume first
        const withVolume = validTrends.filter(t => t.tweet_volume > 0).sort((a, b) => b.tweet_volume - a.tweet_volume);

        if (withVolume.length > 0) {
            return withVolume[0];
        }

        // Fallback: take the first one (highest rank)
        return validTrends[0];
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
