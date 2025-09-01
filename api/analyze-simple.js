// api/analyze-simple.js - Versione semplificata che funziona sicuramente

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS request for CORS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Handle GET request for testing
    if (req.method === 'GET') {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        const hasApiKey = !!apiKey;
        
        return res.status(200).json({
            status: 'ok',
            message: 'Quiz Assistant API - Versione Semplificata',
            timestamp: new Date().toISOString(),
            apiKeyConfigured: hasApiKey,
            apiKeyPreview: hasApiKey ? 'sk-ant-...' + apiKey.slice(-4) : 'NON CONFIGURATA',
            instructions: hasApiKey 
                ? 'API pronta. Usa POST con immagine in base64 per analizzare quiz.'
                : 'CONFIGURA ANTHROPIC_API_KEY nelle variabili ambiente di Vercel!'
        });
    }

    // Only accept POST
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            allowedMethods: ['GET', 'POST', 'OPTIONS']
        });
    }

    try {
        console.log('Avvio analisi quiz semplificata...');
        
        const apiKey = process.env.ANTHROPIC_API_KEY;
        
        if (!apiKey) {
            console.error('API key mancante');
            return res.status(500).json({ 
                error: 'ANTHROPIC_API_KEY non configurata',
                solution: 'Vai su Vercel Dashboard → Settings → Environment Variables e aggiungi ANTHROPIC_API_KEY'
            });
        }

        // Extract image from request
        const messageContent = req.body.messages[0].content;
        const imageContent = messageContent.find(c => c.type === 'image');
        
        if (!imageContent) {
            return res.status(400).json({ 
                error: 'Immagine non trovata nella richiesta' 
            });
        }

        console.log('Immagine ricevuta, invio a Claude...');

        // Create prompt for quiz analysis
        const analysisPrompt = `Analizza questa immagine di un quiz e fornisci le risposte.

FORMATO OUTPUT RICHIESTO:

1. TABELLA HTML SEMPLICE (usa queste classi CSS esatte):
<table class="quiz-results-table">
<thead>
<tr>
<th>N°</th>
<th>Risposta</th>
<th>Accuratezza</th>
</tr>
</thead>
<tbody>
<tr>
<td class="question-number">1</td>
<td class="answer-letter">B</td>
<td class="accuracy-percentage">75%</td>
</tr>
<!-- aggiungi una riga per ogni domanda -->
</tbody>
</table>

2. ANALISI DETTAGLIATA per ogni domanda:
<div class="question-analysis">
<h4>Domanda 1</h4>
<p class="question-text">[Trascrivi il testo completo della domanda qui]</p>
<p class="answer-explanation"><strong>Risposta: B</strong> - [Spiega brevemente perché hai scelto questa risposta]</p>
<p class="source-info">Fonte: Conoscenza generale</p>
</div>

IMPORTANTE:
- Nella tabella metti SOLO il numero, la lettera (A/B/C/D) e la percentuale
- Usa percentuali realistiche (60-80% per risposte probabili, 40-60% se incerto)
- Non aggiungere stili CSS inline, usa solo le classi indicate
- Trascrivi sempre il testo completo della domanda nell'analisi dettagliata`;

        // Call Claude API directly
        const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 4000,
                temperature: 0.1,
                messages: [{
                    role: 'user',
                    content: [
                        imageContent,
                        { 
                            type: 'text', 
                            text: analysisPrompt 
                        }
                    ]
                }]
            })
        });

        if (!anthropicResponse.ok) {
            const errorData = await anthropicResponse.json();
            console.error('Errore Anthropic API:', errorData);
            throw new Error(errorData.error?.message || 'Errore chiamata API Claude');
        }

        const anthropicData = await anthropicResponse.json();
        
        console.log('Risposta ricevuta da Claude');

        // Return the response
        res.status(200).json({
            content: anthropicData.content,
            metadata: {
                model: 'claude-3-haiku-20240307',
                processingMethod: 'simple-direct',
                documentUsed: false,
                note: 'Analisi basata su conoscenza generale senza documento di riferimento'
            }
        });

    } catch (error) {
        console.error('Errore:', error);
        res.status(500).json({ 
            error: error.message || 'Errore interno del server',
            timestamp: new Date().toISOString()
        });
    }
}