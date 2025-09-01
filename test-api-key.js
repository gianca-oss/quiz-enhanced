// test-api-key.js
const testApiKey = async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    console.log('API Key presente:', apiKey ? 'SI' : 'NO');
    console.log('Lunghezza API Key:', apiKey?.length || 0);
    console.log('Inizia con sk-ant:', apiKey?.startsWith('sk-ant-') ? 'SI' : 'NO');
    
    if (!apiKey) {
        console.error('❌ ANTHROPIC_API_KEY non configurata');
        return;
    }
    
    // Test chiamata API
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'test' }]
            })
        });
        
        if (response.ok) {
            console.log('✅ API Key funzionante');
        } else {
            console.error('❌ API Key non valida:', response.status);
        }
    } catch (error) {
        console.error('❌ Errore test API:', error.message);
    }
};

testApiKey();