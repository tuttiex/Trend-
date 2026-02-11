const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.TWITTERAPI_IO_KEY;
const username = process.env.TWITTER_USERNAME;
const password = process.env.TWITTER_PASSWORD;
const email = process.env.TWITTER_EMAIL;
const proxy = process.env.TWITTER_PROXY;
const totp_secret = process.env.TWITTER_2FA_SECRET;

if (!apiKey || !username || !proxy) {
    console.error('❌ Missing .env config (Key, Username, or Proxy)');
    process.exit(1);
}

const candidates = [
    'https://api.twitterapi.io/twitter/user/login_v2',
    'https://api.twitterapi.io/twitter/user/login',
    'https://api.twitterapi.io/user/login_v2',
    'https://api.twitterapi.io/user/login',
    'https://api.twitterapi.io/twitter/login_v2'
];

async function probe() {
    console.log(`🔑 Probing Login with Proxy: ${proxy.slice(0, 15)}...`);

    for (const url of candidates) {
        console.log(`\nTesting POST ${url}...`);
        try {
            const response = await axios.post(url, null, {
                params: {
                    user_name: username,
                    password: password,
                    email: email,
                    proxy: proxy,
                    totp_secret: totp_secret
                },
                headers: {
                    'X-API-Key': apiKey
                }
            });
            console.log(`✅ SUCCESS! ${url} works.`);
            console.log('Sample Data:', JSON.stringify(response.data).substring(0, 100));
            return;
        } catch (error) {
            const status = error.response ? error.response.status : error.message;
            console.log(`❌ Failed (${status})`);
            if (error.response && error.response.data) {
                console.log('Error Data:', JSON.stringify(error.response.data));
            }
        }
    }
    console.log('\n❌ All probes failed.');
}

probe();
