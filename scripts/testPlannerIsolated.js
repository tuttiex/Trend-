require('dotenv').config();
const planner = require('../src/modules/planner'); // Instance is exported
const logger = require('../src/utils/logger');

async function testPlanner() {
    logger.info('Starting isolated Planner test...');
    logger.info(`GEMINI_API_KEY present: ${!!process.env.GEMINI_API_KEY}`);

    try {
        const trends = [
            { name: 'TestTrend', query: 'Test Trend', volume: 1000 }
        ];
        const state = {
            walletAddress: '0x123...',
            balance: '0.1'
        };

        logger.info('Sending plan request to Gemini...');
        const plan = await planner.plan(trends, state);

        logger.info('Plan generated successfully!');
        console.log(JSON.stringify(plan, null, 2));

    } catch (error) {
        logger.error(`Planner test failed: ${error.message}`);
    }
}

testPlanner();
