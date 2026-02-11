const planner = require('../src/modules/planner');

async function testPlanner() {
    console.log('--- OpenClaw Planner Test ---');

    const mockTrends = [
        { name: 'Romero', volume: 9000 },
        { name: 'Tottenham', volume: 9000 },
        { name: 'spurs', volume: 9000 }
    ];

    const mockState = {
        walletAddress: '0x123...abc',
        balance: '0.45',
        lastDeployment: null
    };

    try {
        console.log('\n1. Testing Planning Logic...');
        const plan = await planner.plan(mockTrends, mockState);
        console.log('Generated Plan:', JSON.stringify(plan, null, 2));

        if (plan.action === 'DEPLOY') {
            console.log('✅ Planning logic verified (Success case)');
        } else {
            console.warn('⚠️ Planning logic returned WAIT (Check thresholds)');
        }

        console.log('\n2. Testing Security Filter (Private Key Detection)...');
        const leakedState = { ...mockState, privateKey: '0xdeadbeef...' };
        try {
            await planner.plan(mockTrends, leakedState);
            console.error('❌ Security Test Failed: Planner accepted a private key!');
        } catch (e) {
            console.log('✅ Security Test Passed:', e.message);
        }

    } catch (error) {
        console.error('❌ Planner Test Failed:', error.message);
    }
}

testPlanner();
