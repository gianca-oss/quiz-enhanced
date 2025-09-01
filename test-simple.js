// test-simple.js
const fs = require('fs');

// Leggi direttamente il file .env.local
try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    console.log('Contenuto .env.local:');
    console.log(envContent);
    
    // Parse manuale
    const lines = envContent.split('\n');
    let apiKey = null;
    
    lines.forEach(line => {
        if (line.startsWith('ANTHROPIC_API_KEY=')) {
            apiKey = line.split('=')[1].trim();
        }
    });
    
    console.log('\nAPI Key trovata:', !!apiKey);
    console.log('Lunghezza:', apiKey?.length || 0);
    console.log('Formato corretto:', apiKey?.startsWith('sk-ant-') || false);
    
    if (apiKey) {
        console.log('Prima parte:', apiKey.substring(0, 15) + '...');
    }
    
} catch (error) {
    console.log('Errore lettura file:', error.message);
    console.log('\nCrea il file .env.local con:');
    console.log('echo "ANTHROPIC_API_KEY=la-tua-chiave" > .env.local');
}