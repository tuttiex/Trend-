const moderator = require('../src/utils/contentModerator');

async function testModeration() {
    console.log('--- Content Moderation Test ---');

    const testCases = [
        { topic: 'Romero', expected: 'Approved' },
        { topic: 'Tottenham Hotspur', expected: 'Approved' },
        { topic: 'Election 2024', expected: 'Rejected (Politics)' },
        { topic: 'Terrorist Attack', expected: 'Rejected (Safety)' },
        { topic: 'BadWord Shit', expected: 'Rejected (Profanity)' },
        { topic: 'Hospital Fire', expected: 'Rejected (Tragedy)' }
    ];

    for (const test of testCases) {
        const result = await moderator.checkTopic(test.topic);
        console.log(`\nTopic: "${test.topic}"`);
        console.log(`- Result: ${result.approved ? '✅ APPROVED' : '❌ REJECTED'}`);
        console.log(`- Reason: ${result.reason}`);

        if (result.approved) {
            const sym = moderator.generateSymbol(test.topic);
            console.log(`- Generated Symbol: $${sym}`);
        }
    }
}

testModeration();
