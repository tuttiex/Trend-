const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.TWEETAPI_KEY;
const baseUrl = 'https://api.tweetapi.com/tw-v2';

const candidates = [
    '/trends/place?id=23424908', // specific WOEID (Nigeria)
    '/trends/place?id=1',        // Global
    '/trends?id=23424908',
    '/trends/available',
    '/trends/closest?lat=37.77&long=-122.41',
    '/search?query=%23test&type=Latest' // Known working, baseline check
];

async function probe() {
    console.log('--- Probing TweetAPI.com Trends Endpoints ---');
    console.log(`Base URL: ${baseUrl}`);

    if (!apiKey) {
        console.error('❌ Missing TWEETAPI_KEY in .env');
        return;
    }

    for (const path of candidates) {
        const url = `${baseUrl}${path}`;
        console.log(`\nTesting: GET ${path}`);

        try {
            const response = await axios.get(url, {
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ SUCCESS! Status: ${response.status}`);
            console.log('Data Snippet:', JSON.stringify(response.data).substring(0, 200));
        } catch (error) {
            console.log(`❌ Failed. Status: ${error.response ? error.response.status : 'Network Error'}`);
            if (error.response && error.response.data) {
                console.log('Msg:', JSON.stringify(error.response.data));
            } else {
                console.log('Msg:', error.message);
            }
        }
    }
}

probe();
