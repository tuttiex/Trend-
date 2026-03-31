const trendDetector = require('../src/modules/trendDetection');
const logger = require('../src/utils/logger');

async function testFusion() {
    const regions = ['Nigeria', 'United States'];

    for (const region of regions) {
        console.log(`\n=========================================`);
        console.log(`🔍 TESTING FUSION BRAIN: ${region}`);
        console.log(`=========================================`);

        try {
            const result = await trendDetector.detectTrend(region);
            
            if (result) {
                console.log(`🏆 RANK 1 WINNER: ${result.topic}`);
                console.log(`📊 Score: ${result.topTrends[0].score}`);
                console.log(`📈 Volume: ${result.volume}`);
                console.log(`📡 Sources Used: ${result.sourcesUsed.join(', ')}`);
                console.log(`🛡️ Confidence: ${(result.confidence * 100).toFixed(1)}%`);
                
                console.log(`\n🔥 TOP 5 FUSED TRENDS:`);
                console.table(result.topTrends);
            } else {
                console.log(`❌ No trends found.`);
            }
        } catch (error) {
            console.error(`❌ Fusion Test Failed: ${error.message}`);
        }
    }
}

testFusion();
