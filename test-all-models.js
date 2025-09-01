// test-all-models.js - Test completo modelli disponibili
require('dotenv').config({ path: '.env.local' });

const testAllModels = async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
        console.log('❌ API key mancante');
        return;
    }
    
    console.log('🔍 Test completo modelli con piano MAX...\n');
    
    const modelsToTest = [
        // Haiku
        'claude-3-haiku-20240307',
        
        // Sonnet 3
        'claude-3-sonnet-20240229',
        
        // Sonnet 3.5 (varie date)
        'claude-3-5-sonnet-20240620',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-sonnet-latest',
        
        // Opus
        'claude-3-opus-20240229',
        'claude-3-opus-latest',
        
        // Nomi generici
        'claude-3-haiku',
        'claude-3-sonnet', 
        'claude-3-5-sonnet',
        'claude-3-opus'
    ];
    
    const availableModels = [];
    const unavailableModels = [];
    
    for (const model of modelsToTest) {
        try {
            console.log(`Testing ${model}...`);
            
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: 5,
                    messages: [{ role: 'user', content: 'Hi' }]
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ ${model} - DISPONIBILE`);
                availableModels.push(model);
            } else {
                const errorData = await response.json();
                console.log(`❌ ${model} - ERRORE ${response.status}: ${errorData.error?.message || 'Sconosciuto'}`);
                unavailableModels.push({ model, error: errorData.error?.message || `HTTP ${response.status}` });
            }
            
        } catch (error) {
            console.log(`❌ ${model} - ERRORE RETE: ${error.message}`);
            unavailableModels.push({ model, error: error.message });
        }
        
        // Pausa per evitare rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n📋 RISULTATI FINALI:');
    console.log(`✅ Modelli DISPONIBILI (${availableModels.length}):`);
    availableModels.forEach(model => console.log(`   - ${model}`));
    
    console.log(`\n❌ Modelli NON DISPONIBILI (${unavailableModels.length}):`);
    unavailableModels.forEach(({ model, error }) => console.log(`   - ${model}: ${error}`));
    
    console.log('\n🎯 RACCOMANDAZIONE:');
    if (availableModels.some(m => m.includes('opus'))) {
        console.log('USA OPUS per analisi finale (massima accuratezza)');
    } else if (availableModels.some(m => m.includes('3-5-sonnet'))) {
        console.log('USA SONNET 3.5 per analisi finale (alta accuratezza)');
    } else if (availableModels.some(m => m.includes('sonnet'))) {
        console.log('USA SONNET 3 per analisi finale (buona accuratezza)');
    } else {
        console.log('Solo HAIKU disponibile - useremo ottimizzazioni avanzate');
    }
    
    console.log('\n💡 PIANO CONSIGLIATO:');
    const bestModel = availableModels.find(m => m.includes('opus')) || 
                     availableModels.find(m => m.includes('3-5-sonnet')) ||
                     availableModels.find(m => m.includes('sonnet')) ||
                     availableModels[0];
                     
    if (bestModel) {
        console.log(`Modello consigliato per analisi: ${bestModel}`);
        console.log('Strategia: Haiku (estrazione) + ' + bestModel + ' (analisi)');
    }
};

testAllModels();