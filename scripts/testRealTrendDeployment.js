const trendDetector = require('../src/modules/trendDetection');
const moderator = require('../src/utils/contentModerator');
const hre = require("hardhat");
const logger = require('../src/utils/logger');

async function main() {
    console.log("--- Real Trend Deployment Test ---");

    // 1. Detect Real Trends
    console.log("\n1. Fetching real trends for Nigeria...");
    const nigeriaResult = await trendDetector.detectTrend('Nigeria');
    if (!nigeriaResult || !nigeriaResult.topic) {
        throw new Error("Failed to fetch trends.");
    }
    const topic = nigeriaResult.topic;
    console.log(`- Found Trend: "${topic}"`);

    // 2. Moderate Topic
    console.log("\n2. Moderating topic...");
    const moderationResult = await moderator.checkTopic(topic);
    if (!moderationResult.approved) {
        console.log(`❌ Topic REJECTED: ${moderationResult.reason}`);
        console.log("Searching for a backup trend...");
        // In a real app, we'd loop through Top 3. For this test, let's just use the next if possible.
        // We'll proceed with the first one for now as it's likely safe (e.g., footy or entertainment)
        return;
    }
    console.log(`✅ Topic APPROVED: ${moderationResult.reason}`);

    // 3. Generate Symbol
    const symbol = moderator.generateSymbol(topic);
    const tokenName = `${topic} Token`;
    console.log(`- Generated Name: ${tokenName}`);
    console.log(`- Generated Symbol: $${symbol}`);

    // 4. Deploy to Base Sepolia
    console.log("\n3. Deploying to Base Sepolia...");
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Deploying with account: ${deployer.address}`);

    const TrendToken = await hre.ethers.getContractFactory("TrendToken");
    const token = await TrendToken.deploy(tokenName, symbol, topic, "Nigeria");

    console.log("Waiting for deployment...");
    await token.waitForDeployment();

    const address = await token.getAddress();
    console.log(`\n🚀 SUCCESS! Real Trend Token Deployed!`);
    console.log(`Address: ${address}`);
    console.log(`Topic: ${topic}`);
    console.log(`Explorer: https://sepolia.basescan.org/address/${address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment Failed:");
        console.error(error);
        process.exit(1);
    });
