const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../utils/logger");
const config = require("../config/config");
const fs = require('fs');
const path = require('path');

class ImageGenerator {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            logger.error("ImageGenerator: GEMINI_API_KEY is missing from .env");
            return;
        }
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "imagen-3.0-generate-001" });
    }

    async generateTokenLogo(topic, symbol, region) {
        try {
            logger.info(`🎨 Generating Logo for ${symbol} (${topic} in ${region})...`);

            const prompt = `A minimalist 3D crypto logo for a token named "${topic}". 
            Style: Vector art, smooth gradients, high contrast. 
            Subject: ${topic}. 
            Background: Clean, single-color professional background. 
            Note: No text, no small details. Centered composition.`;

            const result = await this.model.generateImages({
                prompt: prompt,
                number_of_images: 1,
                safety_settings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_LOW_AND_ABOVE" }
                ],
                output_mime_type: "image/png"
            });

            if (result.images && result.images[0]) {
                const buffer = Buffer.from(result.images[0].bytes, "base64");

                // Ensure temp dir exists
                const tempDir = path.join(process.cwd(), 'temp');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

                const filePath = path.join(tempDir, `logo_${symbol}.png`);
                fs.writeFileSync(filePath, buffer);

                logger.info(`✅ Logo generated and saved to ${filePath}`);
                return buffer;
            }

            throw new Error("No image data returned from Gemini");
        } catch (error) {
            logger.error(`❌ Image Generation Failed: ${error.message}`);
            return null;
        }
    }
}

module.exports = new ImageGenerator();
