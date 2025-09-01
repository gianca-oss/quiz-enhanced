// api/analyze-with-docs.js - Versione con supporto documenti da GitHub

// URL base per i file preprocessati su GitHub
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/gianca-oss/quiz-enhanced/main/data/processed-v2/';

// Cache per i dati
let dataCache = null;

/**
 * Carica i dati preprocessati da GitHub
 */
async function loadProcessedData() {
    if (dataCache) return dataCache;
    
    try {
        console.log('📚 Caricamento dati da GitHub...');
        
        // Carica metadata
        const metadataResponse = await fetch(GITHUB_RAW_BASE + 'metadata.json');
        if (!metadataResponse.ok) {
            throw new Error('Metadata non trovati');
        }
        const metadata = await metadataResponse.json();
        
        // Carica search index
        const searchIndexResponse = await fetch(GITHUB_RAW_BASE + 'search-index.json');
        const searchIndex = searchIndexResponse.ok ? await searchIndexResponse.json() : null;
        
        // Carica TUTTI i file chunks disponibili
        const allChunks = [];
        let chunkFileIndex = 0;
        let consecutiveFailures = 0;
        
        console.log('📖 Caricamento chunks...');
        
        while (consecutiveFailures < 2) { // Continua finché non trova 2 file mancanti consecutivi
            try {
                const chunkResponse = await fetch(GITHUB_RAW_BASE + `chunks_${chunkFileIndex}.json`);
                
                if (chunkResponse.ok) {
                    const chunks = await chunkResponse.json();
                    allChunks.push(...chunks);
                    console.log(`  ✓ chunks_${chunkFileIndex}.json - ${chunks.length} chunks caricati`);
                    consecutiveFailures = 0; // Reset counter
                } else {
                    consecutiveFailures++;
                    console.log(`  ✗ chunks_${chunkFileIndex}.json - non trovato`);
                }
                
                chunkFileIndex++;
                
                // Limite di sicurezza
                if (chunkFileIndex > 50) break;
                
            } catch (error) {
                consecutiveFailures++;
                console.log(`  ✗ chunks_${chunkFileIndex}.json - errore caricamento`);
            }
        }
        
        console.log(`✅ Totale chunks caricati: ${allChunks.length}`);
        
        dataCache = {
            metadata,
            searchIndex,
            chunks: allChunks,
            version: 'github-hosted-complete'
        };
        
        return dataCache;
        
    } catch (error) {
        console.error('❌ Errore caricamento dati da GitHub:', error);
        return null;
    }
}

/**
 * Ricerca chunks rilevanti
 */
function searchRelevantChunks(questions, data, maxChunks = 30) {
    if (!data || !data.chunks || data.chunks.length === 0) {
        console.log('❌ Nessun chunk disponibile per la ricerca');
        return [];
    }
    
    console.log(`🔍 Inizio ricerca in ${data.chunks.length} chunks...`);
    const scores = new Map();
    
    // Estrai tutte le keywords dalle domande
    const allKeywords = [];
    questions.forEach(q => {
        // Estrai parole chiave dal testo della domanda
        const words = q.text.toLowerCase()
            .replace(/[^\w\sàèéìòù]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3);
        allKeywords.push(...words);
        
        // Estrai parole dalle opzioni
        Object.values(q.options || {}).forEach(option => {
            const optionWords = option.toLowerCase()
                .replace(/[^\w\sàèéìòù]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 3);
            allKeywords.push(...optionWords.slice(0, 3));
        });
    });
    
    // Rimuovi duplicati
    const uniqueKeywords = [...new Set(allKeywords)];
    console.log(`📝 Keywords estratte: ${uniqueKeywords.slice(0, 10).join(', ')}...`);
    console.log(`   Totale keywords uniche: ${uniqueKeywords.length}`);
    
    // Cerca nei chunks
    let matchCount = 0;
    data.chunks.forEach((chunk, index) => {
        const chunkText = chunk.text.toLowerCase();
        let score = 0;
        let matchedKeywords = [];
        
        uniqueKeywords.forEach(keyword => {
            if (chunkText.includes(keyword)) {
                score += 10;
                matchedKeywords.push(keyword);
            }
        });
        
        if (score > 0) {
            scores.set(index, { score, matchedKeywords });
            matchCount++;
        }
    });
    
    console.log(`📊 Trovati ${matchCount} chunks con corrispondenze`);
    
    // Ordina per score e prendi i migliori
    const sortedChunks = Array.from(scores.entries())
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, maxChunks)
        .map(([index, scoreData]) => ({
            ...data.chunks[index],
            score: scoreData.score,
            matchedKeywords: scoreData.matchedKeywords
        }));
    
    if (sortedChunks.length > 0) {
        console.log(`✅ Top 3 chunks per rilevanza:`);
        sortedChunks.slice(0, 3).forEach((chunk, i) => {
            console.log(`   ${i+1}. Pagina ${chunk.page} (score: ${chunk.score}) - Keywords: ${chunk.matchedKeywords.slice(0, 5).join(', ')}`);
        });
    } else {
        console.log('⚠️ ATTENZIONE: Nessun chunk rilevante trovato!');
    }
    
    return sortedChunks;
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Test endpoint
    if (req.method === 'GET') {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        const hasApiKey = !!apiKey;
        
        // Prova a caricare i dati per test
        const data = await loadProcessedData();
        const hasData = !!data && !!data.chunks && data.chunks.length > 0;
        
        return res.status(200).json({
            status: 'ok',
            message: 'Quiz Assistant API - Con Documenti',
            timestamp: new Date().toISOString(),
            apiKeyConfigured: hasApiKey,
            documentsLoaded: hasData,
            documentsInfo: hasData ? {
                chunks: data.chunks.length,
                pages: [...new Set(data.chunks.map(c => c.page))].length
            } : null,
            githubUrl: GITHUB_RAW_BASE,
            instructions: hasApiKey && hasData
                ? 'API pronta con documenti. Accuratezza migliorata!'
                : 'Configura ANTHROPIC_API_KEY e carica i documenti su GitHub'
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed' 
        });
    }

    try {
        console.log('🚀 Avvio analisi quiz con documenti...');
        
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                error: 'ANTHROPIC_API_KEY non configurata'
            });
        }

        // Estrai immagine
        const messageContent = req.body.messages[0].content;
        const imageContent = messageContent.find(c => c.type === 'image');
        
        if (!imageContent) {
            return res.status(400).json({ 
                error: 'Immagine non trovata' 
            });
        }

        // Carica documenti
        const data = await loadProcessedData();
        
        // STEP 1: Estrai domande dall'immagine
        console.log('📤 Estrazione domande...');
        
        const extractPrompt = `Analizza questa immagine di quiz ed estrai TUTTE le domande.

Fornisci un JSON con questo formato ESATTO:
{
  "questions": [
    {
      "number": 1,
      "text": "testo completo della domanda",
      "options": {
        "A": "testo opzione A",
        "B": "testo opzione B",
        "C": "testo opzione C",
        "D": "testo opzione D"
      }
    }
  ]
}

IMPORTANTE: Restituisci SOLO il JSON, niente altro testo.`;

        const extractResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 2000,
                temperature: 0.1,
                messages: [{
                    role: 'user',
                    content: [imageContent, { type: 'text', text: extractPrompt }]
                }]
            })
        });

        if (!extractResponse.ok) {
            throw new Error('Errore estrazione domande');
        }

        const extractData = await extractResponse.json();
        
        // Parse domande
        let questions;
        try {
            let jsonText = extractData.content[0].text;
            // Pulisci il JSON
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            // Trova l'inizio e la fine del JSON
            const jsonStart = jsonText.indexOf('{');
            const jsonEnd = jsonText.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
            }
            
            const parsed = JSON.parse(jsonText);
            questions = parsed.questions || [];
            console.log(`✅ Estratte ${questions.length} domande`);
        } catch (e) {
            console.error('Errore parsing domande:', e);
            questions = [];
        }

        // STEP 2: Cerca nel documento se disponibile
        let context = '';
        let pagesReferenced = [];
        
        if (data && data.chunks && questions.length > 0) {
            console.log(`🔍 Ricerca in ${data.chunks.length} chunks disponibili...`);
            const relevantChunks = searchRelevantChunks(questions, data, 30); // Aumentato a 30 chunks
            
            if (relevantChunks.length > 0) {
                context = relevantChunks
                    .map(chunk => `[Pagina ${chunk.page}] ${chunk.text}`)
                    .join('\n\n---\n\n');
                
                pagesReferenced = [...new Set(relevantChunks.map(c => c.page))];
                console.log(`📚 Trovati ${relevantChunks.length} chunks rilevanti dalle pagine: ${pagesReferenced.join(', ')}`);
            } else {
                console.log('⚠️ Nessun chunk rilevante trovato');
            }
        } else {
            console.log('⚠️ Nessun documento disponibile o nessuna domanda estratta');
        }

        // STEP 3: Analisi finale con contesto
        console.log('🎯 Analisi finale con contesto...');
        
        const analysisPrompt = `${context ? `IMPORTANTE: USA QUESTO CONTESTO DAL DOCUMENTO DEL CORSO (795 PAGINE):

${context}

ISTRUZIONI CRITICHE:
- DEVI basare le tue risposte PRINCIPALMENTE sul contesto fornito sopra
- Quando trovi informazioni nel contesto, cita SEMPRE la pagina specifica
- Se una risposta è nel contesto, dai accuratezza 90-100%
- Se NON trovi info nel contesto, puoi usare conoscenza generale ma indica "Fonte: Conoscenza generale" con accuratezza 50-70%

` : 'NOTA: Nessun contesto documento disponibile. Usa la tua conoscenza generale.\n\n'}Analizza il quiz e fornisci le risposte.

DOMANDE:
${questions.map((q, i) => `
Q${q.number}: ${q.text}
A) ${q.options.A}
B) ${q.options.B}
C) ${q.options.C}
D) ${q.options.D}
`).join('\n')}

GENERA:

1. TABELLA HTML:
<table class="quiz-results-table">
<thead>
<tr>
<th>N°</th>
<th>Risposta</th>
<th>Accuratezza</th>
</tr>
</thead>
<tbody>
${questions.map(q => `<tr>
<td class="question-number">${q.number}</td>
<td class="answer-letter">[A/B/C/D]</td>
<td class="accuracy-percentage">[%]</td>
</tr>`).join('\n')}
</tbody>
</table>

2. ANALISI DETTAGLIATA per ogni domanda:
<div class="question-analysis">
<h4>Domanda [numero]</h4>
<p class="question-text">[testo domanda]</p>
<p class="answer-explanation"><strong>Risposta: [lettera]</strong> - [spiegazione]</p>
<p class="source-info">Fonte: ${context ? '[Pagina X del documento]' : 'Conoscenza generale'}</p>
</div>

${context ? 'USA IL CONTESTO DEL DOCUMENTO per dare risposte accurate con percentuali 85-100%' : 'Senza documento, usa conoscenza generale con percentuali 40-70%'}`;

        const analysisResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 4000,
                temperature: 0.05,
                messages: [{
                    role: 'user',
                    content: [imageContent, { type: 'text', text: analysisPrompt }]
                }]
            })
        });

        if (!analysisResponse.ok) {
            throw new Error('Errore analisi finale');
        }

        const analysisData = await analysisResponse.json();
        
        console.log('✅ Analisi completata');

        res.status(200).json({
            content: analysisData.content,
            metadata: {
                model: 'claude-3-haiku-20240307',
                processingMethod: 'with-documents',
                documentUsed: !!context,
                questionsAnalyzed: questions.length,
                chunksUsed: context ? context.split('---').length : 0,
                accuracy: context ? 'high' : 'medium'
            }
        });

    } catch (error) {
        console.error('Errore:', error);
        res.status(500).json({ 
            error: error.message || 'Errore interno',
            timestamp: new Date().toISOString()
        });
    }
}