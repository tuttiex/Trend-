const { ethers } = require('ethers');
const logger = require('./logger');

class SafetyManager {
    constructor(signer) {
        this.signer = signer;
        this.DAILY_DEPLOYMENT_CAP = 2; // From Trend Plan Phase 5.2
        this.MIN_BALANCE_THRESHOLD = ethers.parseEther("0.05"); // Alert at 0.05 ETH
        this.MIN_ETH_BALANCE = ethers.parseEther("0.00055"); // Minimum to proceed (User Override)
    }

    async checkSafety(plan) {
        logger.info('SafetyManager: Performing pre-deployment safety checks...');

        // 1. Balance Check
        const balance = await this.signer.provider.getBalance(await this.signer.getAddress());
        logger.info(`SafetyManager: Current balance: ${ethers.formatEther(balance)} ETH`);

        if (balance < this.MIN_BALANCE_THRESHOLD) {
            logger.warn('SafetyManager: LOW BALANCE ALERT! Balance is below 0.05 ETH');
        }

        if (balance < this.MIN_ETH_BALANCE) {
            logger.error('SafetyManager: Insufficient funds for planned action.');
            return { safe: false, reason: 'insufficient_funds' };
        }

        // 2. Validation (Symbol, Name)
        if (!plan.symbol || plan.symbol.length < 2 || plan.symbol.length > 8) {
            return { safe: false, reason: 'invalid_symbol' };
        }

        if (!plan.topic || plan.topic.length > 32) {
            return { safe: false, reason: 'topic_too_long' };
        }

        // 3. Daily Cap Check (Requires Database - Placeholder for now)
        // Future: query stateManager for deployments today

        logger.info('SafetyManager: All safe. Proceeding.');
        return { safe: true };
    }
}

module.exports = SafetyManager;
