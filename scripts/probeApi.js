const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.TWITTERAPI_IO_KEY;

if (!apiKey) {
    console.error('❌ TWITTERAPI_IO_KEY is missing from .env');
    process.exit(1);
}

const candidates = [
    {
        name: 'Twitter-API-v1-v1.1-all-in-one',
        host: 'twitter-api45.p.rapidapi.com',
        url: 'https://twitter-api45.p.rapidapi.com/trends.php',
        params: { woeid: 23424908 }
    },
    {
        name: 'Twitter154',
        host: 'twitter154.p.rapidapi.com',
        url: 'https://twitter154.p.rapidapi.com/trends/',
        params: { woeid: 23424908 }
    },
    {
        name: 'Twitter X',
        host: 'twitter-x.p.rapidapi.com',
        url: 'https://twitter-x.p.rapidapi.com/trends/',
        params: { woeid: 23424908 }
    }
];

async function probe() {
    console.log(`🔑 Probing ${candidates.length} API candidates with key ending in ...${apiKey.slice(-4)}`);

    for (const api of candidates) {
        console.log(`\nTesting ${api.name} (${api.host})...`);
        try {
            const response = await axios.get(api.url, {
                params: api.params,
                headers: {
                    'X-RapidAPI-Key': apiKey,
                    'X-RapidAPI-Host': api.host
                }
            });
            console.log(`✅ SUCCESS! ${api.name} works.`);
            console.log('Sample Data:', JSON.stringify(response.data).substring(0, 100));
            return; // Exit on first success
        } catch (error) {
            const status = error.response ? error.response.status : 'Network Error';
            const msg = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
            console.log(`❌ Failed (${status}): ${msg}`);
        }
    }

    console.log('\n❌ All probes failed. The key does not seem to match these common Twitter APIs.');
}

probe();
