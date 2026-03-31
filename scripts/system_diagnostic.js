const trendDetector = require('../src/modules/trendDetection');
const logger = require('../src/utils/logger');

async function runDiagnostic() {
    console.log(`
╔════════════════════════════════════════════╗
║     TREND AGENT: FULL SYSTEM DIAGNOSTIC    ║
╚════════════════════════════════════════════╝
    `);

    const regions = ['Nigeria', 'United States'];

    for (const region of regions) {
        console.log(`\n🔍 [REGION: ${region.toUpperCase()}]`);
        console.log(`-----------------------------------------`);
        
        try {
            console.log(`📡 Phase 1: Initiating TIER 1/2 Parallel Fetch...`);
            const startTime = Date.now();
            const result = await trendDetector.detectTrend(region);
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            if (result) {
                console.log(`✅ Phase 1 & 2 Success (Time: ${duration}s)`);
                console.log(`🧠 Phase 3: Fusion Results for ${region}:`);
                console.log(`🏆 CHAMPION: "${result.topic}"`);
                console.log(`📊 Score: ${result.topTrends[0].score}`);
                console.log(`📈 Volume: ${result.volume.toLocaleString()}`);
                console.log(`🛡️ Confidence: ${(result.confidence * 100).toFixed(1)}%`);
                console.log(`📡 Sources Involved: ${result.sourcesUsed.join(' + ')}`);

                console.log(`\n🔥 TOP 5 AGGREGATED LIST:`);
                console.table(result.topTrends.map(t => ({
                    Trend: t.name,
                    Volume: t.volume,
                    "Brain Score": t.score
                })));
            } else {
                console.log(`❌ No trends survived filtering for ${region}.`);
            }
        } catch (error) {
            console.error(`❌ Diagnostic Failed for ${region}: ${error.message}`);
            if (error.stack) {
                // Check if it's a Playwright timeout or API 401
                if (error.message.includes('timeout')) console.log(`💡 Tip: This might be a slow network or X UI update.`);
                if (error.message.includes('403')) console.log(`💡 Tip: API Key rate limit reached.`);
            }
        }
    }

    console.log(`\n[DIAGNOSTIC COMPLETE]`);
    console.log(`💡 Check "trends-agent.log" for detailed step-by-step traces.`);
}

runDiagnostic();
