// api/analyze-simple.js - Versione semplificata e stabile

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API key mancante' });
        }
        
        // Inoltra direttamente ad Anthropic
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                ...req.body,
                messages: [{
                    role: 'user',
                    content: [
                        ...req.body.messages[0].content,
                        {
                            type: 'text',
                            text: `Analizza il quiz nell'immagine. 
                            
Crea prima una TABELLA HTML con: Domanda | Risposta | Accuratezza
Poi fornisci l'ANALISI DETTAGLIATA per ogni domanda.

Usa il documento preprocessato (corso_completo.pdf) come riferimento per le risposte.`
                        }
                    ]
                }]
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'Errore API');
        }
        
        res.status(200).json(data);
        
    } catch (error) {
        console.error('Errore:', error);
        res.status(500).json({ error: error.message });
    }
}