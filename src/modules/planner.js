const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require('../utils/logger');
const promptTemplates = require('../config/promptTemplates');
require('dotenv').config();

class Planner {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            logger.warn('GEMINI_API_KEY is missing. Planner will fail.');
        }
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    }

    /**
     * Generate a deployment plan based on trends and state.
     * @param {Array} trends - Top 3 trends.
     * @param {Object} state - Agent financial/wallet state.
     */
    async plan(trends, state) {
        logger.info('🧠 Planner: Analyzing trends with Gemini AI...');

        // Security Check
        if (JSON.stringify(state).toLowerCase().includes('key') || JSON.stringify(state).toLowerCase().includes('private')) {
            throw new Error('SECURITY VIOLATION: Private signals detected in Planner input.');
        }

        try {
            const systemPrompt = promptTemplates.PLANNER_SYSTEM_PROMPT;
            const userPrompt = promptTemplates.PLANNER_USER_PROMPT(trends, state);

            const prompt = `${systemPrompt}\n\nUser Context:\n${userPrompt}\n\nRespond strictly in valid JSON format.`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            let text = response.text();

            // Clean markdown blocks if present
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            const plan = JSON.parse(text);

            logger.info('🧠 Planner: Decision received.', plan);
            return plan;

        } catch (error) {
            logger.error('Planner Error (Gemini):', error.message);
            // Fallback to safe WAIT if AI fails
            return { action: 'WAIT', rationale: 'AI Service Failure' };
        }
    }
}

module.exports = new Planner();
