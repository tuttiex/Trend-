const tweetApiCom = require('../src/services/tweetApiCom');
require('dotenv').config();

// Nigeria WOEID
const WOEID = 23424908;

async function main() {
    console.log('--- TweetAPI.com Trends Test ---');

    try {
        console.log(`Fetching trends for WOEID: ${WOEID}...`);
        const result = await tweetApiCom.getTrends(WOEID);
        console.log('✅ Success! Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('❌ Failed to fetch trends via TweetAPI.com:', error.message);
        if (error.response && error.response.data) {
            console.error('API Error Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

main();
