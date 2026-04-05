require('dotenv').config();
const imageGenerator = require('../src/services/imageGenerator');
const logger = require('../src/utils/logger');

async function testFluxPro() {
    console.log('🎨 Testing FLUX-1.1-pro image generation...');
    
    try {
        const buffer = await imageGenerator.generateTokenLogo(
            'Test Trend', 
            'TEST', 
            'Nigeria'
        );
        
        if (buffer) {
            console.log('✅ FLUX-1.1-pro image generated successfully!');
            console.log('📊 Image size:', buffer.length, 'bytes');
        } else {
            console.error('❌ Image generation returned null');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testFluxPro();
