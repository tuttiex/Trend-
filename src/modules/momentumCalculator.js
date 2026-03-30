const logger = require('../utils/logger');
const stateManager = require('../services/stateManager'); // We need to ensure we can get the average volume

class MomentumCalculator {
    constructor() {
        this.MULTIPLIER = 10_000_000;
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
}

module.exports = new MomentumCalculator();
