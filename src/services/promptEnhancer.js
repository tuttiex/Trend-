const GroqClient = require('./groqClient');
const logger = require('../utils/logger');

/**
 * Enhances image generation prompts with semantic trend context using LLM
 * Focuses on WHAT the trend means, not popularity metrics
 */
class PromptEnhancer {
    constructor() {
        this.groq = new GroqClient();
        this.model = process.env.GROQ_PLANNER_MODEL || 'llama-3.3-70b-versatile';
    }

    /**
     * Analyze trend meaning and generate contextual image prompt
     * @param {Object} trendData - { name, region }
     * @returns {Promise<string>} Enhanced prompt for image generation
     */
    async enhancePrompt(trendData) {
        const { name, region } = trendData;
        
        const systemPrompt = `You are a creative director specializing in crypto token logos.
Your job: Analyze a trending topic and create a vivid image generation prompt.

FOCUS ON:
- What the trend IS (person, event, concept, meme)
- Visual symbolism that represents it
- Appropriate colors and mood
- Regional/cultural context if relevant
- Category: sports, politics, entertainment, tech, finance, meme, etc.

RULES:
- Keep prompt under 80 words
- Include "3D crypto token logo" and "vector art, clean background"
- No text in the image
- Be specific about visual elements

Output ONLY the image prompt.`;

        const userPrompt = `Trend: "${name}"
Region: ${region}

Analyze this trend:
1. What/who is it? (celebrity, event, meme, sports team, etc.)
2. What visual elements represent it?
3. What colors fit the theme?
4. Any regional/cultural context?

Create an image generation prompt.`;

        try {
            logger.info(`PromptEnhancer: Analyzing "${name}" for ${region}...`);
            
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const response = await this.groq.chatCompletion(messages, {
                model: this.model,
                temperature: 0.7,
                maxTokens: 150
            });

            const enhancedPrompt = response.trim();
            logger.info(`PromptEnhancer: "${enhancedPrompt.slice(0, 60)}..."`);
            
            return enhancedPrompt;

        } catch (err) {
            logger.warn(`PromptEnhancer failed: ${err.message}. Using default.`);
            return `A minimalist 3D crypto token logo for "${name}". Vector art, smooth gradients, clean background, no text, centered composition. PNG format.`;
        }
    }
}

module.exports = new PromptEnhancer();
