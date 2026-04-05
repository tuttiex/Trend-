require('dotenv').config();
const axios = require('axios');

async function testGroq() {
    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) {
        console.error('❌ GROQ_API_KEY not found in .env');
        process.exit(1);
    }
    
    console.log('🔍 Testing Groq API...');
    console.log('API Key present:', apiKey.substring(0, 10) + '...');
    
    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Say "Groq API is working!" and nothing else.' }
                ],
                temperature: 0.7,
                max_tokens: 50
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        const message = response.data.choices[0].message.content;
        console.log('✅ Groq API Response:', message);
        console.log('✅ API Key is working!');
        console.log('📊 Usage:', response.data.usage);
        
    } catch (error) {
        console.error('❌ Groq API Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Error data:', error.response.data);
        }
        process.exit(1);
    }
}

testGroq();
