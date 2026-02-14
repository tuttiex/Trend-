const TweetApiCom = require('../src/services/tweetApiCom');
require('dotenv').config();

async function main() {
    console.log("Testing TweetAPI.com posting...");
    const api = new TweetApiCom();

    try {
        const text = `Test tweet from dev environment, testing 1, testing 2 ${Date.now()}`;
        console.log(`Attempting to post: "${text}"`);
        const result = await api.postTweet(text);
        console.log("Success:", result);
    } catch (error) {
        console.error("Failed:", error.message);
        if (error.response) {
            console.error("Response data:", error.response.data);
        }
    }
}

main().catch(console.error);
