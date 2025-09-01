// test-model-access.js
require('dotenv').config({ path: '.env.local' }); // Carica .env.local

const testModelAccess = async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    console.log('Debug API Key:');
    console.log('- Presente:', !!apiKey);
    console.log('- Lunghezza:', apiKey?.length || 0);
    console.log('- Formato:', apiKey?.startsWith('sk-ant-') ? 'Corretto' : 'Errato');
    
    if (!apiKey) {
        console.log('\n❌ Configura ANTHROPIC_API_KEY in .env.local');
        console.log('Formato: ANTHROPIC_API_KEY=sk-ant-api03-xxxxx');
        return;
    }
    
    // Resto del codice test modelli...
    const modelsToTest = [
        'claude-3-haiku-20240307',
        'claude-3-sonnet-20240229', 
        'claude-3-5-sonnet-20240620'
    ];
    
    console.log('\n🧪 Test accesso modelli Claude...\n');
    
    for (const model of modelsToTest) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: 10,
                    messages: [{ role: 'user', content: 'test' }]
                })
            });
            
            if (response.ok) {
                console.log(`✅ ${model} - DISPONIBILE`);
            } else {
                const error = await response.json();
                console.log(`❌ ${model} - ERRORE ${response.status}: ${error.error?.message || 'Sconosciuto'}`);
            }
            
        } catch (error) {
            console.log(`❌ ${model} - ERRORE: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
};

testModelAccess();