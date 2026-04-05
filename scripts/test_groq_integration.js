require('dotenv').config();
const planner = require('../src/modules/planner');
const contentModerator = require('../src/utils/contentModerator');
const logger = require('../src/utils/logger');

async function testGroqIntegration() {
    console.log('🧪 Testing Groq Integration...\n');
    
    // Test 1: Content Moderator
    console.log('1️⃣ Testing Content Moderator with Groq...');
    const testTopics = [
        'Cole Palmer',  // Should be safe
        'Taylor Swift', // Should be safe
        'Election 2024' // Should be blocked by blocklist
    ];
    
    for (const topic of testTopics) {
        console.log(`   Testing: "${topic}"`);
        const result = await contentModerator.checkTopic(topic);
        console.log(`   Result: ${result.approved ? '✅ APPROVED' : '❌ REJECTED'} - ${result.reason}`);
        if (result.symbol) {
            console.log(`   Symbol: ${result.symbol}`);
        }
        console.log();
    }
    
    // Test 2: Planner
    console.log('2️⃣ Testing Planner with Groq...');
    const mockTrends = [
        { name: 'Cole Palmer', tweet_volume: 150000 },
        { name: 'Xbox', tweet_volume: 80000 },
        { name: 'Champions League', tweet_volume: 200000 }
    ];
    
    const mockState = {
        walletBalance: '0.05',
        deployedToday: 2,
        avgGasPrice: '0.0001'
    };
    
    try {
        const plan = await planner.plan(mockTrends, mockState);
        console.log('   ✅ Planner returned a decision:');
        console.log('   Action:', plan.action);
        console.log('   Topic:', plan.topic);
        console.log('   Symbol:', plan.symbol);
        console.log('   Rationale:', plan.rationale);
    } catch (error) {
        console.error('   ❌ Planner failed:', error.message);
    }
    
    console.log('\n✨ Groq integration test complete!');
}

testGroqIntegration().catch(console.error);
