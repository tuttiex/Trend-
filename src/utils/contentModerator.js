const logger = require('./logger');

class ContentModerator {
    constructor() {
        // Layer 1: Blocklist (Hardcoded terms)
        this.blocklist = [
            // Profanity (Generic placeholders)
            'fuck', 'shit', 'piss', 'cunt', 'asshole', 'badword',
            // Sensitive/Political (Example list)
            'war', 'death', 'kill', 'suicide', 'bomb', 'terrorism',
            'nazi', 'racist', 'hate', 'slur',
            'election', 'democrat', 'republican', 'trump', 'biden', 'putin',
            // Scam/Deceptive
            'scam', 'rug', 'honeypot', 'ponzi', 'hack', 'steal'
        ];
    }

    /**
     * Comprehensive check for a trend topic.
     * @param {string} topic 
     * @returns {Object} { approved: boolean, reason: string, sanitized: string }
     */
    async checkTopic(topic) {
        logger.info(`Moderating topic: "${topic}"`);

        // Layer 1: Blocklist Check
        const blocklistMatch = this.checkBlocklist(topic);
        if (blocklistMatch.blocked) {
            logger.warn(`Moderation REJECTED (Blocklist): "${topic}" matched term "${blocklistMatch.term}"`);
            return { approved: false, reason: `Matches banned term: ${blocklistMatch.term}` };
        }

        // Layer 2: Length and Character Check
        if (topic.length < 2 || topic.length > 50) {
            return { approved: false, reason: 'Topic length out of bounds' };
        }

        // Layer 3: LLM Context Analysis (Placeholder for OpenClaw/LLM call)
        // In a real scenario, we'd call an LLM to ask if the topic is sensitive or inappropriate.
        const isSensitive = await this.checkLLMSensitivity(topic);
        if (isSensitive) {
            logger.warn(`Moderation REJECTED (LLM): "${topic}" deemed sensitive by AI.`);
            return { approved: false, reason: 'AI detected sensitive or inappropriate context' };
        }

        // Sanitization
        const sanitized = this.sanitize(topic);
        const symbol = this.generateSymbol(topic);

        return {
            approved: true,
            reason: 'Passed all safety checks',
            sanitized: sanitized,
            symbol: symbol
        };
    }

    /**
     * Checks if topic contains any items from the blocklist.
     */
    checkBlocklist(topic) {
        const lowerTopic = topic.toLowerCase();
        for (const term of this.blocklist) {
            if (lowerTopic.includes(term)) {
                return { blocked: true, term };
            }
        }
        return { blocked: false };
    }

    /**
     * Placeholder for LLM-based sensitivity check.
     */
    async checkLLMSensitivity(topic) {
        // Simulation: Reject topics with "sensitive" sounding words for testing
        const sensitiveSim = ['crime', 'hospital', 'tragedy', 'attack'];
        return sensitiveSim.some(term => topic.toLowerCase().includes(term));
    }

    /**
     * Cleans up the string for use in token names.
     */
    sanitize(text) {
        // Remove special characters, keep letters, numbers, and spaces
        return text.replace(/[^\w\s]/gi, '').trim();
    }

    /**
     * Generates a 3-5 character symbol for a topic.
     * Example: "Romero" -> "ROME"
     */
    generateSymbol(topic) {
        const clean = this.sanitize(topic).replace(/\s+/g, '');
        if (clean.length <= 4) return clean.toUpperCase();

        // Take consonants first or just first 4
        const letters = clean.toUpperCase().split('');
        const vowels = ['A', 'E', 'I', 'O', 'U'];
        let symbol = letters[0];

        for (let i = 1; i < letters.length && symbol.length < 4; i++) {
            if (!vowels.includes(letters[i])) {
                symbol += letters[i];
            }
        }

        // Fallback to first 4 characters if consonants aren't enough
        if (symbol.length < 3) {
            symbol = clean.substring(0, 4).toUpperCase();
        }

        return symbol;
    }
}

module.exports = new ContentModerator();
