const axios = require('axios');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Generates token logos using:
 *   1. Gemini 2.5 Flash Image (primary)
 *   2. SiliconFlow FLUX.1-schnell (fallback if Gemini fails)
 */
class ImageGenerator {
    constructor() {
        // Primary: Gemini 2.5 Flash Image
        this.geminiKey = process.env.GEMINI_API_KEY;
        this.geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

        // Fallback: SiliconFlow FLUX.1-schnell
        this.siliconFlowKey = process.env.SILICONFLOW_API_KEY;
        this.siliconFlowEndpoint = 'https://api.siliconflow.com/v1/images/generations';
        this.siliconFlowModel = 'black-forest-labs/FLUX.1-schnell';

        if (!this.geminiKey) logger.warn('ImageGenerator: GEMINI_API_KEY is missing — will use SiliconFlow only.');
        if (!this.siliconFlowKey) logger.warn('ImageGenerator: SILICONFLOW_API_KEY is missing — no fallback available.');
    }

    async generateTokenLogo(topic, symbol, region) {
        logger.info(`🎨 Generating Logo for ${symbol} (${topic} in ${region})...`);

        const prompt = `A minimalist 3D crypto token logo for "${topic}". 
            Style: Vector art, smooth gradients, high contrast. 
            Background: Clean, single solid-color professional background. 
            No text, no small details. Centered composition. PNG format.`;

        // ── Primary: Gemini 2.5 Flash Image ──────────────────────────────────
        if (this.geminiKey) {
            try {
                logger.info('🤖 Trying Gemini 2.5 Flash Image...');
                const response = await axios.post(
                    `${this.geminiEndpoint}?key=${this.geminiKey}`,
                    {
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
                    },
                    { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
                );

                const parts = response.data?.candidates?.[0]?.content?.parts || [];
                const imagePart = parts.find(p => p.inlineData?.data);

                if (imagePart) {
                    const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
                    this._saveTempFile(buffer, symbol);
                    logger.info('✅ Gemini image generated successfully!');
                    return buffer;
                }
                throw new Error('No image part in Gemini response');

            } catch (err) {
                const detail = err.response?.data?.error?.message || err.message;
                logger.warn(`⚠️ Gemini failed: ${detail}. Trying SiliconFlow fallback...`);
            }
        }

        // ── Fallback: SiliconFlow FLUX.1-schnell ─────────────────────────────
        if (this.siliconFlowKey) {
            try {
                logger.info('🔁 Trying SiliconFlow FLUX.1-schnell...');
                const response = await axios.post(
                    this.siliconFlowEndpoint,
                    {
                        model: this.siliconFlowModel,
                        prompt: prompt,
                        n: 1,
                        image_size: '512x512',
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.siliconFlowKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 60000
                    }
                );

                const imageUrl = response.data?.images?.[0]?.url;
                if (!imageUrl) throw new Error('No image URL in SiliconFlow response');

                // Download the image from the returned URL
                const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
                const buffer = Buffer.from(imgResponse.data);
                this._saveTempFile(buffer, symbol);
                logger.info('✅ SiliconFlow FLUX image generated successfully!');
                return buffer;

            } catch (err) {
                const detail = err.response?.data?.message || err.message;
                logger.error(`❌ SiliconFlow also failed: ${detail}`);
            }
        }

        logger.error('❌ All image generation providers failed. Returning null.');
        return null;
    }

    _saveTempFile(buffer, symbol) {
        try {
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            const filePath = path.join(tempDir, `logo_${symbol}.png`);
            fs.writeFileSync(filePath, buffer);
            logger.info(`💾 Logo saved to ${filePath}`);
        } catch (e) {
            logger.warn(`Could not save temp file: ${e.message}`);
        }
    }
}

module.exports = new ImageGenerator();
