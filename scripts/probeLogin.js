const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.TWITTERAPI_IO_KEY;
const username = process.env.TWITTER_USERNAME;
const password = process.env.TWITTER_PASSWORD;
const email = process.env.TWITTER_EMAIL;

if (!apiKey || !username || !password || !email) {
    console.error('❌ Credentials missing in .env');
    process.exit(1);
}

const candidates = [
    { method: 'POST', url: 'https://api.twitterapi.io/twitter/user/login_v2' },
    { method: 'POST', url: 'https://api.twitterapi.io/twitter/user/login' },
    { method: 'POST', url: 'https://api.twitterapi.io/user/login_v2' }, // No /twitter prefix
    { method: 'POST', url: 'https://api.twitterapi.io/user/login' },
    { method: 'GET', url: 'https://api.twitterapi.io/twitter/user/login_v2' } // Checking if GET is allowed
];

async function probe() {
    console.log(`🔑 Probing Login endpoints for ${username}...`);

    for (const api of candidates) {
        console.log(`\nTesting ${api.method} ${api.url}...`);
        try {
            const response = await axios({
                method: api.method,
                url: api.url,
                params: {
                    user_name: username,
                    password: password,
                    email: email
                },
                headers: {
                    'X-API-Key': apiKey
                }
            });
            console.log(`✅ SUCCESS! ${api.url} works.`);
            console.log('Sample Data:', JSON.stringify(response.data).substring(0, 100));
            return;
        } catch (error) {
            const status = error.response ? error.response.status : 'Network Error';
            console.log(`❌ Failed (${status})`);
        }
    }

    console.log('\n❌ All probes failed.');
}

probe();
