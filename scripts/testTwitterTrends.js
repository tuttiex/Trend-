const trendDetector = require('../src/modules/trendDetection');

async function main() {
    console.log('--- TwitterAPI.io Trend Detection Test ---');

    try {
        console.log('\nTesting Nigeria (WAN)...');
        const nigeriaTrend = await trendDetector.detectTrend('Nigeria');
        if (nigeriaTrend) {
            console.log('Nigeria Result:', JSON.stringify(nigeriaTrend, null, 2));
            console.log('Top 3 Nigeria:', nigeriaTrend.topTrends);
        } else {
            console.log('Nigeria Result: NULL');
        }

        console.log('\nWaiting 6 seconds to respect Rate Limit...');
        await new Promise(r => setTimeout(r, 6000));

        console.log('\nTesting US...');
        const usTrend = await trendDetector.detectTrend('US');
        if (usTrend) {
            console.log('US Result:', JSON.stringify(usTrend, null, 2));
            console.log('Top 3 US:', usTrend.topTrends);
        } else {
            console.log('US Result: NULL');
        }

    } catch (error) {
        console.error('\n❌ Trend Detection Failed:', error.message);
    }
}

main();
