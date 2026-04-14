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
        this.weights = {
            'OFFICIAL_API': 1.2,
            'TWITTER_API_IO': 0.8,
            'TRENDS24': 0.7,
            'GETDAYTRENDS': 0.6
        };
        logger.info('TrendDetector: Fused Brain initialized.');
    }

    async detectTrend(regionName) {
        const woeid = this.getWOEID(regionName);

        // TIER 1: APIs (Parallel)
        logger.info(`[TIER 1] Attempting API Parallel Fetch for ${regionName}...`);
        const apiResults = await Promise.allSettled([
            this.tryOfficialAPI(woeid),
            this.tryTwitterApiIo(woeid)
        ]);

        let allSourceData = [];
        apiResults.forEach((res, i) => {
            if (res.status === 'fulfilled' && res.value.length > 0) {
                const sourceName = i === 0 ? 'OFFICIAL_API' : 'TWITTER_API_IO';
                allSourceData.push({ source: sourceName, trends: res.value });
            }
        });

        // If TIER 1 gave us at least 10 unique trends, we might stop here (efficiency)
        // However, user requested "compare and pick" for scrapers if APIs fail.
        if (allSourceData.length === 0) {
            logger.warn(`[TIER 1] Both APIs failed for ${regionName}. Initiating TIER 2 Scraper Gauntlet...`);
            
            // TIER 2: Scrapers (Parallel)
            const scraperResults = await Promise.allSettled([
                trendScraper.scrapeTrends24(regionName),
                trendScraper.scrapeGetDayTrends(regionName)
            ]);

            scraperResults.forEach((res, i) => {
                if (res.status === 'fulfilled' && res.value.length > 0) {
                    const sourceNames = ['TRENDS24', 'GETDAYTRENDS'];
                    allSourceData.push({ source: sourceNames[i], trends: res.value });
                }
            });
        }

        if (allSourceData.length === 0) {
            logger.error(`❌ CRITICAL: All trend sources failed for ${regionName}.`);
            throw new Error('All trend sources failed.');
        }

        // TIER 3: FUSION BRAIN
        logger.info(`[TIER 3] Fusing data from ${allSourceData.length} sources for ${regionName}...`);
        const fused = this.fuseTrendSources(allSourceData);
        
        if (!fused || fused.length === 0) return null;

        const primaryTrend = fused[0];
        const top5 = fused.slice(0, 5).map(t => ({ name: t.name, volume: t.volume, score: t.score.toFixed(2) }));

        logger.info(`🏆 Winner for ${regionName}: ${primaryTrend.name} (Score: ${primaryTrend.score.toFixed(2)})`);

        return {
            region: regionName,
            topic: primaryTrend.name,
            volume: primaryTrend.volume,
            topTrends: top5,
            confidence: this.calculateConfidence(primaryTrend.score, primaryTrend.volume),
            timestamp: new Date().toISOString(),
            sourcesUsed: allSourceData.map(s => s.source)
        };
    }

    async tryOfficialAPI(woeid) {
        try {
            const apiResponse = await twitterClient.getTrends(woeid);
            let trendsList = null;
            if (Array.isArray(apiResponse) && apiResponse[0]?.trends) trendsList = apiResponse[0].trends;
            else if (apiResponse?.trends) trendsList = apiResponse.trends;
            else if (apiResponse?.data?.trends) trendsList = apiResponse.data.trends;

            if (trendsList && Array.isArray(trendsList)) {
                return trendsList.map((t, index) => ({
                    name: t.name || t.trend_name,
                    volume: t.tweet_volume || t.volume || 0,
                    rank: index + 1
                }));
            }
            return [];
        } catch (e) {
            return [];
        }
    }

    async tryTwitterApiIo(woeid) {
        try { return await twitterApiIo.getTrends(woeid); }
        catch (e) { return []; }
    }

    fuseTrendSources(sources) {
        const trendMap = new Map();

        sources.forEach(source => {
            const weight = this.weights[source.source] || 0.5;
            source.trends.forEach(t => {
                // Normalize name
                const normName = t.name.trim().toUpperCase();
                if (!normName || this.isBlacklisted(normName)) return;

                if (!trendMap.has(normName)) {
                    trendMap.set(normName, {
                        name: t.name,
                        normalized: normName,
                        volume: 0,
                        rankScore: 0,
                        occurences: 0,
                        sourcesInvolved: []
                    });
                }

                const entry = trendMap.get(normName);
                entry.occurences += 1;
                entry.sourcesInvolved.push(source.source);
                // Volume: Keep the max reported volume
                if (t.volume > entry.volume) entry.volume = t.volume;
                
                // Rank Score: Lower rank is better. 
                // Using (1 / Rank) * weight
                entry.rankScore += (1 / t.rank) * weight;
            });
        });

        // Calculate final scores
        const results = Array.from(trendMap.values()).map(entry => {
            // Formula: RankScore * (Frequency Bonus)
            // Frequency Bonus: 1 + (occurences - 1) * 0.2
            const frequencyBonus = 1 + (entry.occurences - 1) * 0.25;
            const finalScore = entry.rankScore * frequencyBonus;

            return {
                ...entry,
                score: finalScore
            };
        });

        // Sort by final score descending
        return results.sort((a, b) => b.score - a.score);
    }

    isBlacklisted(name) {
        return BLACKLIST.some(word => name.includes(word));
    }

    getWOEID(region) {
        const normalized = region.toLowerCase();
        if (normalized === 'nigeria') return WOEID_NIGERIA;
        if (normalized === 'us' || normalized === 'united states') return WOEID_US;
        return null;
    }

    calculateConfidence(score, volume) {
        // High score + High volume = High confidence
        let confidence = 0.5;
        if (score > 1.5) confidence += 0.2;
        if (score > 0.8) confidence += 0.1;
        if (volume > 50000) confidence += 0.15;
        return Math.min(confidence, 0.98);
    }
}

module.exports = new TrendDetector();
