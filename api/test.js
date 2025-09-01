// api/test.js - Test minimo per verificare che Vercel funzioni

export default function handler(req, res) {
    // Test basico senza dipendenze esterne
    const apiKey = process.env.ANTHROPIC_API_KEY || 'non-configurata';
    
    res.status(200).json({
        message: 'API Test funzionante!',
        method: req.method,
        timestamp: new Date().toISOString(),
        hasApiKey: apiKey !== 'non-configurata',
        apiKeyLength: apiKey.length,
        headers: req.headers,
        nodeVersion: process.version
    });
}