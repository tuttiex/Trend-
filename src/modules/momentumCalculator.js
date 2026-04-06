const logger = require('../utils/logger');
const stateManager = require('../services/stateManager'); // We need to ensure we can get the average volume

class MomentumCalculator {
    constructor() {
        this.MULTIPLIER = 10_000_000;
        this.CREATOR_FEE_PERCENT = parseFloat(process.env.CREATOR_FEE_PERCENT) || 1.0;
    }

    /**
     * Calculates the required token supply based on the current volume and average regional volume.
     * Formula: Supply = (Trend Volume − Average Regional Volume) × 10,000,000
     * Returns the supply in whole tokens (not wei).
     * 
     * @param {number} currentVolume 
     * @param {number} averageVolume 
     * @returns {number} The calculated supply 
     */
    calculateSupply(currentVolume, averageVolume) {
        if (!currentVolume || currentVolume <= 0) return 0;
        
        const diff = currentVolume - Math.round(averageVolume || 0);
        // If the trend volume is below average, we might just default to a baseline or 0
        if (diff <= 0) {
            return 1_000_000; // Provide a baseline 1M supply for below-average new trends
        }

        return diff * this.MULTIPLIER;
    }

    /**
     * Calculates the creator fee amount (1% of supply by default).
     * @param {number} supply - Total token supply
     * @returns {number} Fee amount in whole tokens
     */
    calculateFeeAmount(supply) {
        return Math.floor(supply * (this.CREATOR_FEE_PERCENT / 100));
    }

    /**
     * Calculates the net supply after deducting creator fee.
     * @param {number} supply - Total token supply
     * @returns {number} Net supply for liquidity pool (99% of total)
     */
    calculateNetSupply(supply) {
        const fee = this.calculateFeeAmount(supply);
        return supply - fee;
    }

    /**
     * Gets full supply breakdown including fee calculation.
     * @param {number} currentVolume 
     * @param {number} averageVolume 
     * @returns {Object} { totalSupply, creatorFee, netSupply }
     */
    calculateSupplyWithFee(currentVolume, averageVolume) {
        const totalSupply = this.calculateSupply(currentVolume, averageVolume);
        const creatorFee = this.calculateFeeAmount(totalSupply);
        const netSupply = totalSupply - creatorFee;
        
        return {
            totalSupply,
            creatorFee,
            netSupply,
            feePercent: this.CREATOR_FEE_PERCENT
        };
    }

    /**
     * Calculates the new tokens to mint based on the volume difference.
     * @param {number} newVolume 
     * @param {number} previousVolume 
     * @returns {number} Tokens to mint
     */
    calculateAdditionalSupply(newVolume, previousVolume) {
        if (!newVolume || !previousVolume) return 0;
        const diff = newVolume - previousVolume;
        if (diff <= 0) return 0;
        return diff * this.MULTIPLIER;
    }

    /**
     * Calculates additional supply with fee breakdown for momentum minting.
     * @param {number} newVolume 
     * @param {number} previousVolume 
     * @returns {Object} { totalAdditional, creatorFee, netAdditional }
     */
    calculateAdditionalSupplyWithFee(newVolume, previousVolume) {
        const totalAdditional = this.calculateAdditionalSupply(newVolume, previousVolume);
        const creatorFee = this.calculateFeeAmount(totalAdditional);
        const netAdditional = totalAdditional - creatorFee;
        
        return {
            totalAdditional,
            creatorFee,
            netAdditional,
            feePercent: this.CREATOR_FEE_PERCENT
        };
    }
}

module.exports = new MomentumCalculator();
