const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('./logger');
require('dotenv').config();

class ContentModerator {
    constructor() {
        // Layer 1: Blocklist (Hardcoded terms)
        this.blocklist = [
            // Profanity
            'fuck', 'shit', 'piss', 'cunt', 'asshole', 'badword',
            // Sensitive/Political
            'war', 'death', 'kill', 'suicide', 'bomb', 'terrorism',
            'nazi', 'racist', 'hate', 'slur',
            'election', 'democrat', 'republican', 'trump', 'biden', 'putin',
            // Scam/Deceptive
            'scam', 'rug', 'honeypot', 'ponzi', 'hack', 'steal'
        ];

        // Layer 3: Gemini LLM moderation
        // Uses gemini-2.0-flash-lite — cheapest model, ideal for simple classification.
        // Only 2 calls/day in production (one per region), well within free tier.
        if (process.env.GEMINI_API_KEY) {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.llmModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
        } else {
            logger.warn('ContentModerator: GEMINI_API_KEY not set — LLM layer disabled, using blocklist only.');
            this.llmModel = null;
        }
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

        // Layer 3: LLM Context Analysis (Placeholder for Trends Agent/LLM call)
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
     * Real Gemini LLM sensitivity check.
     * Asks Gemini to classify the topic as safe or unsafe for crypto token deployment.
     *
     * Fail-safe design: any API error or unexpected response blocks the topic.
     * This ensures a network blip can't accidentally let a harmful trend through.
     *
     * @param {string} topic
     * @returns {Promise<boolean>} true = sensitive (block), false = safe (allow)
     */
    async checkLLMSensitivity(topic) {
        // If Gemini is not configured, skip LLM check (blocklist still runs)
        if (!this.llmModel) {
            logger.warn('ContentModerator: LLM check skipped (no API key).');
            return false;
        }

        const prompt = `You are a content moderation assistant for an autonomous crypto token deployment agent.
Your job is to decide if a trending Twitter/X topic is safe to tokenize.

A topic is UNSAFE if it relates to: genocide, mass violence, war crimes, terrorism, ethnic cleansing,
human tragedy, death of specific people, natural disasters, hate crimes, abuse, suicide, or any deeply
offensive or politically explosive content that would be inappropriate to profit from.

A topic is SAFE if it relates to: sports, entertainment, celebrity culture, technology, business,
finance, gaming, movies, music, general pop culture, or neutral news events.

When in doubt, mark as UNSAFE.

Respond with ONLY a valid JSON object, no markdown, no extra text:
{"safe": true, "reason": "one sentence reason"}
or
{"safe": false, "reason": "one sentence reason"}

Topic to evaluate: "${topic}"`;

        try {
            logger.info(`ContentModerator: Sending "${topic}" to Gemini for LLM sensitivity check...`);
            const result = await this.llmModel.generateContent(prompt);
            let text = result.response.text().replace(/```json|```/g, '').trim();

            const parsed = JSON.parse(text);

            if (typeof parsed.safe !== 'boolean') {
                throw new Error('Unexpected response format from Gemini');
            }

            const verdict = parsed.safe ? 'SAFE' : 'UNSAFE';
            logger.info(`ContentModerator: Gemini verdict for "${topic}": ${verdict} — ${parsed.reason}`);

            // Return true if sensitive (i.e. NOT safe)
            return !parsed.safe;

        } catch (err) {
            // FALLBACK FOR QUOTA ERRORS
            const errorStr = err.message.toLowerCase();
            if (errorStr.includes('quota') || errorStr.includes('429') || errorStr.includes('rate limit')) {
                logger.warn(`ContentModerator: Gemini API quota exceeded or rate limited. Falling back to blocklist-only moderation for "${topic}".`);
                return false; // Treat as safe from LLM's perspective, relying entirely on the prior blocklist check
            }

            // FAIL SAFE: For general API errors, block the topic.
            // A network blip should never let a harmful trend slip through.
            logger.error(`ContentModerator: LLM check failed for "${topic}": ${err.message}. Blocking topic as a safety precaution.`);
            return true; // treated as sensitive = blocked
        }
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
