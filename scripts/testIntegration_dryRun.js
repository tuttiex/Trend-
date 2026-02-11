const Pipeline = require('../src/pipeline');
const logger = require('../src/utils/logger');
const { ethers } = require('ethers');

async function dryRun() {
    logger.info('--- Starting Pipeline Dry Run (Integration Test) ---');

    // 1. Mock Signer
    const mockSigner = {
        getAddress: async () => '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        provider: {
            getBalance: async () => ethers.parseEther("1.0"),
            getNetwork: async () => ({ chainId: 84532 }), // Base Sepolia
        }
    };

    // 2. Mock State Manager (to avoid DB dependency during logic test)
    const mockStateManager = {
        saveDeployment: async (data) => {
            logger.info('MOCK StateManager: Deployment saved successfully.', { token: data.tokenAddress });
            return 1;
        }
    };

    const pipeline = new Pipeline(mockSigner, mockStateManager);

    // 3. Mock Orchestrator to skip real blockchain calls
    pipeline.orchestrator.executeDeployment = async (plan) => {
        logger.info('MOCK Orchestrator: Deployment successful.');
        return {
            success: true,
            tokenAddress: '0x1234567890123456789012345678901234567890',
            poolAddress: '0x0987654321098765432109876543210987654321',
            liquidityTx: '0xabc123'
        };
    };

    try {
        const result = await pipeline.execute('Nigeria');
        logger.info('--- Integration Test Result ---');
        console.log(result);

        if (result.status === 'success') {
            logger.info('✅ Pipeline Dry Run Successful.');
        } else {
            logger.warn(`⚠️ Pipeline skipped or rejected: ${result.reason}`);
        }
    } catch (error) {
        logger.error(`❌ Integration Test Failed: ${error.message}`);
        process.exit(1);
    }
}

dryRun();
