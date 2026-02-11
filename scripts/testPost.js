const tweetApiCom = require('../src/services/tweetApiCom');
require('dotenv').config();

async function main() {
    console.log('--- TweetAPI.com Post Test ---');

    // Check if we have the credentials set
    if (!process.env.TWEETAPI_KEY || !process.env.TWITTER_AUTH_TOKEN) {
        console.warn('⚠️  WARNING: Missing Credentials for TweetAPI.com.');
        console.warn('Please set TWEETAPI_KEY and TWITTER_AUTH_TOKEN in .env');
    }

    const testMessage = `Test Tweet via TweetAPI.com from Trend- Bot at ${new Date().toISOString()} - ${Math.floor(Math.random() * 1000)}`;

    try {
        console.log(`Sending: "${testMessage}"...`);
        const result = await tweetApiCom.postTweet(testMessage);
        console.log('✅ Success! Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ Failed to post tweet via TweetAPI.com:', error.message);
        if (error.response && error.response.data) {
            console.error('API Error Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

main();
