const axios = require('axios');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const promptEnhancer = require('./promptEnhancer');
require('dotenv').config();

/**
 * Generates token logos using:
 *   1. Pollinations.ai (primary - free, fast, no API key)
 *   2. SiliconFlow FLUX-1.1-pro (fallback - paid, higher quality)
 *   3. Gemini 2.5 Flash Image (final fallback)
 */
class ImageGenerator {
    constructor() {
        // Fallback 1: SiliconFlow FLUX-1.1-pro (paid, higher quality)
        this.siliconFlowKey = process.env.SILICONFLOW_API_KEY;
        this.siliconFlowEndpoint = 'https://api.siliconflow.com/v1/images/generations';
        this.siliconFlowModel = 'black-forest-labs/FLUX-1.1-pro';

        // Fallback 2: Gemini 2.5 Flash Image
        this.geminiKey = process.env.GEMINI_API_KEY;
        this.geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

        if (!this.siliconFlowKey) logger.warn('ImageGenerator: SILICONFLOW_API_KEY is missing — will use Gemini fallback or fail.');
        if (!this.geminiKey) logger.warn('ImageGenerator: GEMINI_API_KEY is missing — no fallback available.');
    }

    async generateTokenLogo(topic, symbol, region, useEnhancedPrompt = false) {
        logger.info(`🎨 Generating Logo for ${symbol} (${topic} in ${region})...`);

        let prompt;
        if (useEnhancedPrompt) {
            // Use LLM to analyze trend context (name + region only)
            prompt = await promptEnhancer.enhancePrompt({
                name: topic,
                region: region
            });
        } else {
            // Standard prompt
            prompt = `A minimalist 3D crypto token logo for "${topic}". 
                Style: Vector art, smooth gradients, high contrast. 
                Background: Clean, single solid-color professional background. 
                No text, no small details. Centered composition. PNG format.`;
        }

        // ── Primary: Pollinations.ai (free, no API key) ────────────────────────
        try {
            logger.info('🎨 Trying Pollinations.ai (free, no API key)...');
            const encodedPrompt = encodeURIComponent(prompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true`;
            
            const response = await axios.get(imageUrl, { 
                responseType: 'arraybuffer',
                timeout: 120000,  // 2 minutes for generation
                headers: { 'Accept': 'image/png' }
            });

            const buffer = Buffer.from(response.data);
            this._saveTempFile(buffer, symbol);
            logger.info('✅ Pollinations.ai image generated successfully!');
            return buffer;

        } catch (err) {
            logger.warn(`⚠️ Pollinations failed: ${err.message}. Trying SiliconFlow fallback...`);
        }

        // ── Fallback: SiliconFlow FLUX-1.1-pro ───────────────────────────────
        if (this.siliconFlowKey) {
            try {
                logger.info('🤖 Trying SiliconFlow FLUX-1.1-pro...');
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
                        timeout: 120000
                    }
                );

                const imageUrl = response.data?.images?.[0]?.url;
                if (!imageUrl) throw new Error('No image URL in SiliconFlow response');

                // Download the image from the returned URL
                const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
                const buffer = Buffer.from(imgResponse.data);
                this._saveTempFile(buffer, symbol);
                logger.info('✅ SiliconFlow FLUX image generated successfully!');
                return buffer;

            } catch (err) {
                const detail = err.response?.data?.message || err.message;
                logger.warn(`⚠️ SiliconFlow FLUX failed: ${detail}. Trying Gemini fallback...`);
            }
        }

        // ── Fallback: Gemini 2.5 Flash Image ─────────────────────────────────
        if (this.geminiKey) {
            try {
                logger.info('🔁 Trying Gemini 2.5 Flash Image...');
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
                logger.error(`❌ Gemini also failed: ${detail}`);
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
