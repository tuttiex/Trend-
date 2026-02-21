const axios = require('axios');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Generates token logos using Gemini 2.5 Flash Image via the generateContent REST API.
 * Uses responseModalities: ["IMAGE"] — free tier, no billing required.
 */
class ImageGenerator {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = 'gemini-2.5-flash-image';
        this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

        if (!this.apiKey) {
            logger.error('ImageGenerator: GEMINI_API_KEY is missing from .env');
        }
    }

    async generateTokenLogo(topic, symbol, region) {
        if (!this.apiKey) {
            logger.error('ImageGenerator: Cannot generate — GEMINI_API_KEY is not set.');
            return null;
        }

        logger.info(`🎨 Generating Logo for ${symbol} (${topic} in ${region})...`);

        const prompt = `A minimalist 3D crypto token logo for "${topic}". 
            Style: Vector art, smooth gradients, high contrast. 
            Background: Clean, single solid-color professional background. 
            No text, no small details. Centered composition. PNG format.`;

        try {
            const response = await axios.post(
                `${this.endpoint}?key=${this.apiKey}`,
                {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseModalities: ['IMAGE', 'TEXT']
                    }
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000
                }
            );

            // Find the image part in the response
            const parts = response.data?.candidates?.[0]?.content?.parts || [];
            const imagePart = parts.find(p => p.inlineData?.data);

            if (!imagePart) {
                throw new Error('No image returned in Gemini response');
            }

            const buffer = Buffer.from(imagePart.inlineData.data, 'base64');

            // Save to temp dir
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            const filePath = path.join(tempDir, `logo_${symbol}.png`);
            fs.writeFileSync(filePath, buffer);

            logger.info(`✅ Logo generated and saved to ${filePath}`);
            return buffer;

        } catch (error) {
            const detail = error.response?.data?.error?.message || error.message;
            logger.error(`❌ Image Generation Failed: ${detail}`);
            return null;
        }
    }
}

module.exports = new ImageGenerator();
