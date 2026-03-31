const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

class TrendScraper {
    constructor() {
        this.baseUrl = 'https://getdaytrends.com';
    }

    /**
     * Scrape trends for a specific region.
     * @param {string} regionName - 'nigeria' or 'united-states' (or 'world' for global)
     */
    async getTrends(regionName) {
        // 1. Try GetDayTrends (Primary Scraper)
        try {
            const data = await this.scrapeGetDayTrends(regionName);
            if (data && data.length > 0) return data;
        } catch (e) {
            logger.warn(`TrendScraper: GetDayTrends failed for ${regionName}: ${e.message}`);
        }

        // 2. Try Trends24 (Secondary Scraper)
        try {
            const data = await this.scrapeTrends24(regionName);
            if (data && data.length > 0) return data;
        } catch (e) {
            logger.warn(`TrendScraper: Trends24 failed for ${regionName}: ${e.message}`);
        }

        return [];
    }

    async scrapeGetDayTrends(regionName) {
        let path = '';
        const normalized = regionName.toLowerCase();
        if (normalized === 'nigeria' || normalized.includes('nigeria')) path = '/nigeria/';
        else if (normalized === 'us' || normalized === 'united states' || normalized.includes('united')) path = '/united-states/';
        else path = '/';

        const url = `${this.baseUrl}${path}`;
        logger.info(`Scraping trends from GetDayTrends: ${url}...`);

        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
        });

        const $ = cheerio.load(response.data);
        const trends = [];
        $('table.table tbody tr').each((index, element) => {
            const name = $(element).find('td.main a.string').text().trim();
            let volumeStr = $(element).find('td.main div.desc span.small').text().trim();
            if (!volumeStr) volumeStr = $(element).find('td').last().text().trim();

            if (name) {
                trends.push({
                    name: name,
                    volume: this.parseVolume(volumeStr),
                    rank: index + 1
                });
            }
        });
        return trends;
    }

    async scrapeTrends24(regionName) {
        let path = '';
        const normalized = regionName.toLowerCase();
        if (normalized === 'nigeria' || normalized.includes('nigeria')) path = 'nigeria/';
        else if (normalized === 'us' || normalized === 'united states' || normalized.includes('united')) path = 'united-states/';
        
        const url = `https://trends24.in/${path}`;
        logger.info(`Scraping trends from Trends24: ${url}...`);

        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
        });

        const $ = cheerio.load(response.data);
        const trends = [];
        
        // Trends24 groups trends in hourly blocks. We want the first block (latest).
        const latestBlock = $('.trend-card').first();
        latestBlock.find('.trend-list li').each((index, element) => {
            const name = $(element).find('a').first().text().trim();
            const volumeStr = $(element).find('.tweet-count').text().trim();

            if (name) {
                trends.push({
                    name: name,
                    volume: this.parseVolume(volumeStr),
                    rank: index + 1
                });
            }
        });
        return trends;
    }

    parseVolume(volumeStr) {
        if (!volumeStr) return 0;
        let volume = 0;
        const cleanVol = volumeStr.toUpperCase().replace(/TWEETS?/i, '').replace(/POSTS?/i, '').trim();

        if (cleanVol.includes('UNDER 10K')) return 9000;
        if (cleanVol.includes('K')) volume = parseFloat(cleanVol) * 1000;
        else if (cleanVol.includes('M')) volume = parseFloat(cleanVol) * 1000000;
        else {
            const plain = parseInt(cleanVol.replace(/,/g, '').replace(/[^0-9]/g, ''), 10);
            volume = isNaN(plain) ? 0 : plain;
        }
        return Math.floor(volume);
    }
}

module.exports = new TrendScraper();
