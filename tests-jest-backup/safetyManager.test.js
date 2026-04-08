const SafetyManager = require('../src/utils/safetyManager');
const { ethers } = require('ethers');

describe('SafetyManager', () => {
    let safetyManager;
    let mockSigner;

    beforeEach(() => {
        mockSigner = {
            getAddress: jest.fn().mockResolvedValue('0x123'),
            provider: {
                getBalance: jest.fn().mockResolvedValue(ethers.parseEther("1.0"))
            }
        };
        safetyManager = new SafetyManager(mockSigner);
    });

    test('should approve if balance is sufficient and inputs are valid', async () => {
        const plan = { topic: 'Test', symbol: 'TEST' };
        const result = await safetyManager.checkSafety(plan);
        expect(result.safe).toBe(true);
    });

    test('should reject if balance is too low', async () => {
        mockSigner.provider.getBalance.mockResolvedValue(ethers.parseEther("0.01"));
        const plan = { topic: 'Test', symbol: 'TEST' };
        const result = await safetyManager.checkSafety(plan);
        expect(result.safe).toBe(false);
        expect(result.reason).toBe('insufficient_funds');
    });

    test('should reject if symbol is too short', async () => {
        const plan = { topic: 'Test', symbol: 'T' };
        const result = await safetyManager.checkSafety(plan);
        expect(result.safe).toBe(false);
        expect(result.reason).toBe('invalid_symbol');
    });
});
