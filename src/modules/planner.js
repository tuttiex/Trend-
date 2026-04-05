const GroqClient = require('../services/groqClient');
const logger = require('../utils/logger');
const promptTemplates = require('../config/promptTemplates');
require('dotenv').config();

class Planner {
    constructor() {
        this.groq = new GroqClient();
        // Use environment variable or default to llama-3.3-70b-versatile
        this.model = process.env.GROQ_PLANNER_MODEL || 'llama-3.3-70b-versatile';
        
        if (!process.env.GROQ_API_KEY) {
            logger.warn('GROQ_API_KEY is missing. Planner will fail.');
        }
    }

    /**
     * Generate a deployment plan based on trends and state.
     * @param {Array} trends - Top 3 trends.
     * @param {Object} state - Agent financial/wallet state.
     */
    async plan(trends, state) {
        logger.info('🧠 Planner: Analyzing trends with Groq Llama...');

        // Security Check
        if (JSON.stringify(state).toLowerCase().includes('key') || JSON.stringify(state).toLowerCase().includes('private')) {
            throw new Error('SECURITY VIOLATION: Private signals detected in Planner input.');
        }

        try {
            const systemPrompt = promptTemplates.PLANNER_SYSTEM_PROMPT;
            const userPrompt = promptTemplates.PLANNER_USER_PROMPT(trends, state);

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `${userPrompt}\n\nRespond strictly in valid JSON format.` }
            ];

            const response = await this.groq.chatCompletion(messages, {
                model: this.model,
                jsonMode: true,
                temperature: 0.7,
                maxTokens: 1024
            });

            // Clean markdown blocks if present
            let text = response.replace(/```json/g, '').replace(/```/g, '').trim();

            const plan = JSON.parse(text);

            logger.info('🧠 Planner: Decision received.', plan);
            return plan;

        } catch (error) {
            logger.error('Planner Error (Groq):', error.message);
            // Fallback to safe WAIT if AI fails
            return { action: 'WAIT', rationale: 'AI Service Failure' };
        }
    }
}

module.exports = new Planner();
