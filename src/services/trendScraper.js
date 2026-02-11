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
        // Map common region names to URL paths
        let path = '';
        const normalized = regionName.toLowerCase();

        if (normalized === 'nigeria' || normalized.includes('nigeria')) {
            path = '/nigeria/';
        } else if (normalized === 'us' || normalized === 'united states' || normalized.includes('united')) {
            path = '/united-states/';
        } else {
            path = '/'; // Global/World
        }

        const url = `${this.baseUrl}${path}`;

        try {
            logger.info(`Scraping trends from ${url}...`);

            // User-Agent is important for scraping to avoid immediate blocking
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const trends = [];

            // Targeted selector for GetDayTrends table rows
            // Usually simpler to look for links containing /trend/ or specific table classes
            // The site structure usually lists trends in a table or list

            // Iterate over table rows in the main trends table
            $('table.table tbody tr').each((index, element) => {
                // Name is in 'a.string'
                const name = $(element).find('td.main a.string').text().trim();

                // Volume is in div.desc > span.small inside the same td.main
                let volumeStr = $(element).find('td.main div.desc span.small').text().trim();

                // If not found there, try the graph/preview column or just generic last column as fallback
                if (!volumeStr) {
                    volumeStr = $(element).find('td').last().text().trim();
                }

                // Clean up: "Under 10K tweets", "50.2K tweets"
                let volume = 0;
                const cleanVol = volumeStr.replace(/tweets?/i, '').trim().toUpperCase();

                if (cleanVol.includes('UNDER 10K')) {
                    volume = 9000; // Arbitrary low value for sorting
                } else if (cleanVol.includes('K')) {
                    volume = parseFloat(cleanVol) * 1000;
                } else if (cleanVol.includes('M')) {
                    volume = parseFloat(cleanVol) * 1000000;
                } else {
                    // Try parsing plain numbers
                    const plain = parseInt(cleanVol.replace(/,/g, '').replace(/[^0-9]/g, ''), 10);
                    volume = isNaN(plain) ? 0 : plain;
                }

                if (name) {
                    trends.push({
                        name: name,
                        tweet_volume: volume,
                        url: $(element).find('a').attr('href')
                    });
                }
            });

            logger.info(`Scraped ${trends.length} trends for ${regionName}.`);
            return trends;

        } catch (error) {
            logger.error(`Error scraping trends from ${url}:`, error.message);
            throw error;
        }
    }
}

module.exports = new TrendScraper();
