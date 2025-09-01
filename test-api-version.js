// test-api-version.js
require('dotenv').config({ path: '.env.local' });

const testApiVersion = async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    // Test con versione API più recente
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2024-06-01' // Versione più recente
        },
        body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'test' }]
        })
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', data);
};

testApiVersion();