const GroqClient = require('../services/groqClient');
const logger = require('./logger');
require('dotenv').config();

class ContentModerator {
    constructor() {
        // Examples of inappropriate terms for AI guidance (not automatic blocking)
        this.prohibitedExamples = [
            // Profanity examples
            'fuck', 'shit', 'piss', 'cunt', 'asshole', 'badword',
            // Harmful/Violent examples
            'war', 'death', 'kill', 'suicide', 'bomb', 'terrorism',
            'nazi', 'racist', 'hate', 'slur',
            // Scam/Deceptive examples
            'scam', 'rug', 'honeypot', 'ponzi', 'hack', 'steal'
        ];

        // Layer 2: Groq LLM moderation
        if (process.env.GROQ_API_KEY) {
            this.groq = new GroqClient();
            this.model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
        } else {
            logger.warn('ContentModerator: GROQ_API_KEY not set — AI moderation disabled.');
            this.groq = null;
        }
    }

    /**
     * Comprehensive check for a trend topic.
     * @param {string} topic 
     * @returns {Object} { approved: boolean, reason: string, sanitized: string }
     */
    async checkTopic(topic) {
        logger.info(`Moderating topic: "${topic}"`);

        // Layer 1: Length and Character Check
        if (topic.length < 2 || topic.length > 50) {
            return { approved: false, reason: 'Topic length out of bounds' };
        }

        // Layer 2: AI Context Analysis (Primary Decision Maker)
        const aiDecision = await this.checkLLMSensitivity(topic);
        if (aiDecision.blocked) {
            logger.warn(`Moderation REJECTED (AI): "${topic}" - ${aiDecision.reason}`);
            return { approved: false, reason: aiDecision.reason };
        }

        // Sanitization
        const sanitized = this.sanitize(topic);
        const symbol = this.generateSymbol(topic);

        return {
            approved: true,
            reason: aiDecision.reason || 'Passed all safety checks',
            sanitized: sanitized,
            symbol: symbol
        };
    }

    /**
     * AI-based sensitivity check using Groq LLM.
     * Uses prohibitedExamples as guidance for the AI.
     * 
     * @param {string} topic
     * @returns {Promise<Object>} { blocked: boolean, reason: string }
     */
    async checkLLMSensitivity(topic) {
        if (!this.groq) {
            logger.warn('ContentModerator: LLM check skipped (no API key). Allowing all topics.');
            return { blocked: false, reason: 'AI moderation disabled' };
        }

        const examplesList = this.prohibitedExamples.join(', ');

        const systemPrompt = `You are a content moderation assistant for an autonomous crypto token deployment agent.
Your job is to decide if a trending Twitter/X topic is safe to tokenize.

EXAMPLES OF INAPPROPRIATE TERMS (use as guidance, not strict rules):
${examplesList}

A topic is UNSAFE if it relates to: genocide, mass violence, war crimes, terrorism, ethnic cleansing,
human tragedy, death of specific people, natural disasters, hate crimes, abuse, suicide, or any deeply
offensive or politically explosive content that would be inappropriate to profit from.

CONTEXT MATTERS:
- "Warren Buffett" (person) is SAFE even though it contains "war"
- "Killer Whale Documentary" is SAFE even though it contains "kill"
- "Crypto Scam Awareness" might be SAFE if educational context
- "Hitler" alone is UNSAFE (historical figure associated with genocide)
- "Blockchain Death Cross" is SAFE (technical trading term)

Use your judgment. Consider the full context of the topic, not just individual words.

A topic is SAFE if it relates to: sports, entertainment, celebrity culture, technology, business,
finance, gaming, movies, music, general pop culture, or neutral news events.

When in doubt, mark as UNSAFE.

Respond with ONLY a valid JSON object, no markdown, no extra text:
{"safe": true, "reason": "one sentence reason"}
or
{"safe": false, "reason": "one sentence reason"}`;

        try {
            logger.info(`ContentModerator: Sending "${topic}" to Groq for AI analysis...`);
            
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Topic to evaluate: "${topic}"` }
            ];

            const response = await this.groq.chatCompletion(messages, {
                model: this.model,
                jsonMode: true,
                temperature: 0.2,
                maxTokens: 150
            });

            let text = response.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(text);

            if (typeof parsed.safe !== 'boolean' || !parsed.reason) {
                throw new Error('Unexpected response format from Groq');
            }

            const verdict = parsed.safe ? 'SAFE' : 'UNSAFE';
            logger.info(`ContentModerator: AI verdict for "${topic}": ${verdict} — ${parsed.reason}`);

            return {
                blocked: !parsed.safe,
                reason: parsed.reason
            };

        } catch (err) {
            // Fallback: if AI fails, default to allowing (but log warning)
            const errorStr = err.message.toLowerCase();
            if (errorStr.includes('quota') || errorStr.includes('429') || errorStr.includes('rate limit')) {
                logger.warn(`ContentModerator: Groq API quota exceeded. Allowing "${topic}" with warning.`);
                return { blocked: false, reason: 'AI check skipped due to API limits' };
            }

            logger.error(`ContentModerator: AI check failed for "${topic}": ${err.message}. Blocking as precaution.`);
            return { blocked: true, reason: 'AI moderation check failed - blocked for safety' };
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
