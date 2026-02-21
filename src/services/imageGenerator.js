const axios = require('axios');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Generates token logos using the Imagen 3 REST API directly.
 * This bypasses the @google/generative-ai SDK which does not expose
 * generateImages in v0.24.x, calling the endpoint directly instead.
 */
class ImageGenerator {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict';

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

        const prompt = `A minimalist 3D crypto logo for a token named "${topic}". 
            Style: Vector art, smooth gradients, high contrast. 
            Subject: ${topic}. 
            Background: Clean, single-color professional background. 
            Note: No text, no small details. Centered composition.`;

        try {
            const response = await axios.post(
                `${this.endpoint}?key=${this.apiKey}`,
                {
                    instances: [{ prompt: prompt }],
                    parameters: {
                        sampleCount: 1,
                        outputMimeType: 'image/png'
                    }
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000
                }
            );

            const predictions = response.data?.predictions;
            if (!predictions || predictions.length === 0) {
                throw new Error('No image predictions returned from Imagen API');
            }

            // Response field is bytesBase64Encoded
            const base64Image = predictions[0]?.bytesBase64Encoded;
            if (!base64Image) {
                throw new Error('Image prediction missing bytesBase64Encoded field');
            }

            const buffer = Buffer.from(base64Image, 'base64');

            // Save to temp dir for debugging
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
