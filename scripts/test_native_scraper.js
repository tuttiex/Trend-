require('dotenv').config();
const nativeXScraperNG = require('../src/services/nativeXScraper');
const nativeXScraperUS = require('../src/services/nativeXScraperUS');
const logger = require('../src/utils/logger');

async function test() {
    logger.info('--- Starting Unified Native X Scraper Test (Regional Silos) ---');
    
    // Testing Nigeria (Silo 1)
    logger.info(`Testing region: Nigeria`);
    try {
        const trends = await nativeXScraperNG.getTrends('Nigeria');
        if (trends.length > 0) {
            console.table(trends.slice(0, 5));
            logger.info(`✅ Successfully fetched ${trends.length} Nigerian trends.`);
        } else {
            logger.error(`❌ Failed to fetch Nigerian trends.`);
        }
    } catch (error) {
        logger.error(`Test Error (Nigeria): ${error.message}`);
    }
    console.log('\n');

    // Testing United States (Silo 2)
    logger.info(`Testing region: United States`);
    try {
        const trends = await nativeXScraperUS.getTrends();
        if (trends.length > 0) {
            console.table(trends.slice(0, 5));
            logger.info(`✅ Successfully fetched ${trends.length} US trends.`);
        } else {
            logger.error(`❌ Failed to fetch US trends.`);
        }
    } catch (error) {
        logger.error(`Test Error (United States): ${error.message}`);
    }
}

test().then(() => logger.info('Test completed.'));
