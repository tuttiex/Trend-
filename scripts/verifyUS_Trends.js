const trendDetector = require('../src/modules/trendDetection');
const logger = require('../src/utils/logger');
require('dotenv').config();

async function main() {
    console.log("Testing US Region Trend Detection...");

    try {
        const trend = await trendDetector.detectTrend('United States');
        if (trend) {
            console.log("\n✅ US Trend Detected!");
            console.log("Topic:", trend.topic);
            console.log("Volume:", trend.volume);
            console.log("Confidence:", trend.confidence);
            console.log("Top Trends:", JSON.stringify(trend.topTrends, null, 2));
        } else {
            console.log("❌ No trends found for US.");
        }
    } catch (error) {
        console.error("❌ Error detecting US trends:", error.message);
    }
}

main().catch(console.error);
