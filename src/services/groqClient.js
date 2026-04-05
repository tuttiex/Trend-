const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Groq API Client - OpenAI-compatible API for Llama models
 * Fast inference with competitive pricing
 */
class GroqClient {
    constructor() {
        this.apiKey = process.env.GROQ_API_KEY;
        this.baseUrl = 'https://api.groq.com/openai/v1';
        
        // Model selection via environment variable or defaults
        this.defaultModel = process.env.GROQ_DEFAULT_MODEL || 'llama-3.3-70b-versatile';
        this.fastModel = process.env.GROQ_FAST_MODEL || 'llama-3.1-8b-instant';
        
        if (!this.apiKey) {
            logger.warn('GroqClient: GROQ_API_KEY is not set - client will fail on use');
        }
    }

    /**
     * Send a chat completion request to Groq
     * @param {Array} messages - Array of message objects [{role, content}]
     * @param {Object} options - Options: model, temperature, maxTokens, jsonMode
     * @returns {Promise<string>} - Response text
     */
    async chatCompletion(messages, options = {}) {
        if (!this.apiKey) {
            throw new Error('GroqClient: GROQ_API_KEY is not configured');
        }

        const model = options.model || this.defaultModel;
        const temperature = options.temperature !== undefined ? options.temperature : 0.7;
        const maxTokens = options.maxTokens || 1024;

        const requestBody = {
            model: model,
            messages: messages,
            temperature: temperature,
            max_tokens: maxTokens
        };

        // Add response_format for JSON mode if requested
        if (options.jsonMode) {
            requestBody.response_format = { type: 'json_object' };
        }

        try {
            logger.debug(`GroqClient: Sending request to ${model}`);
            
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: options.timeout || 30000
                }
            );

            const content = response.data.choices[0].message.content;
            const usage = response.data.usage;

            logger.debug(`GroqClient: Response received. Tokens: ${usage.total_tokens}`);

            return content;

        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            const statusCode = error.response?.status;

            if (statusCode === 429) {
                logger.warn('GroqClient: Rate limit exceeded');
                throw new Error('GROQ_RATE_LIMIT: ' + errorMsg);
            } else if (statusCode === 401) {
                logger.error('GroqClient: Invalid API key');
                throw new Error('GROQ_AUTH_ERROR: ' + errorMsg);
            } else {
                logger.error(`GroqClient: API error (${statusCode}): ${errorMsg}`);
                throw new Error('GROQ_API_ERROR: ' + errorMsg);
            }
        }
    }

    /**
     * Quick method for simple prompts
     * @param {string} prompt - User prompt
     * @param {string} systemPrompt - Optional system prompt
     * @param {Object} options - Additional options
     * @returns {Promise<string>} - Response text
     */
    async quickPrompt(prompt, systemPrompt = null, options = {}) {
        const messages = [];
        
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        
        messages.push({ role: 'user', content: prompt });
        
        return this.chatCompletion(messages, options);
    }
}

module.exports = GroqClient;
