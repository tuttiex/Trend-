const trendScraper = require('../src/services/trendScraper');

async function main() {
    console.log('--- Trend Scraper Test ---');

    try {
        console.log('\nTesting Nigeria...');
        const nigeriaTrends = await trendScraper.getTrends('nigeria');
        console.log(`✅ Success! Found ${nigeriaTrends.length} trends.`);
        if (nigeriaTrends.length > 0) {
            console.log('Top 3:', JSON.stringify(nigeriaTrends.slice(0, 3), null, 2));
        } else {
            console.warn('⚠️  Warning: Scraper returned 0 trends. Check selectors.');
        }

        console.log('\nTesting US...');
        const usTrends = await trendScraper.getTrends('united states');
        console.log(`✅ Success! Found ${usTrends.length} trends.`);
        if (usTrends.length > 0) {
            console.log('Top 3:', JSON.stringify(usTrends.slice(0, 3), null, 2));
        }

    } catch (error) {
        console.error('❌ Scraper Failed:', error.message);
    }
}

main();
