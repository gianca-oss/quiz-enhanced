// api/analyze-smart.js - API ottimizzata con approccio ibrido Haiku/Sonnet

const { promises: fs } = require('fs');
const path = require('path');

// Cache per i dati preprocessati
let dataCache = null;

/**
 * Estrae e analizza metadati dell'immagine dal contenuto della richiesta
 */
function extractImageMetadata(messageContent) {
    const imageContent = messageContent.find(c => c.type === 'image');
    if (!imageContent) return null;
    
    const base64Data = imageContent.source.data;
    const sizeKB = Math.round((base64Data.length * 0.75) / 1024);
    
    let estimatedQuality = 'medium';
    if (sizeKB > 500) estimatedQuality = 'high';
    else if (sizeKB < 200) estimatedQuality = 'low';
    
    return {
        source: 'enhanced-capture',
        processing: 'optimized-for-ocr',
        estimatedQuality,
        sizeKB,
        timestamp: new Date().toISOString(),
        format: imageContent.source.media_type || 'image/jpeg'
    };
}

/**
 * Determina la strategia di elaborazione con selezione modello ibrida
 */
function determineProcessingStrategy(imageMetadata, requestHeaders) {
    const strategy = {
        // Solo Haiku disponibile - ottimizziamo tutto per questo modello
        extractionModel: 'claude-3-haiku-20240307',
        analysisModel: 'claude-3-haiku-20240307',
        
        // Parametri ottimizzati per Haiku
        useSemanticSearch: true,
        maxChunks: 20, // Aumentiamo per compensare le limitazioni del modello
        searchTimeout: 6000,
        
        // Token ottimizzati per Haiku (limit 4096)
        extractionMaxTokens: 2500,
        analysisMaxTokens: 3800,
        
        // Strategia multi-pass per Haiku
        useMultiPass: true,
        enhancedKeywords: true
    };
    
    // Adatta alla qualità immagine
    if (imageMetadata) {
        switch (imageMetadata.estimatedQuality) {
            case 'high':
                strategy.maxChunks = 25;
                strategy.searchTimeout = 7000;
                strategy.analysisMaxTokens = 3900;
                strategy.enhancedKeywords = true;
                break;
                
            case 'low':
                strategy.maxChunks = 15;
                strategy.searchTimeout = 4000;
                strategy.analysisMaxTokens = 3500;
                strategy.useMultiPass = false; // Semplifica per qualità bassa
                break;
                
            case 'medium':
            default:
                // Mantieni valori base ottimizzati
                break;
        }
    }
    
    // Header personalizzati
    if (requestHeaders['x-processing-mode'] === 'fast') {
        strategy.maxChunks = 12;
        strategy.searchTimeout = 3000;
        strategy.analysisMaxTokens = 3200;
        strategy.useMultiPass = false;
    } else if (requestHeaders['x-processing-mode'] === 'thorough') {
        strategy.maxChunks = 30;
        strategy.searchTimeout = 10000;
        strategy.analysisMaxTokens = 3900;
        strategy.useMultiPass = true;
        strategy.enhancedKeywords = true;
    }
    
    return strategy;
}

/**
 * Carica i dati preprocessati con gestione errori migliorata
 */
async function loadProcessedData() {
    if (dataCache) return dataCache;
    
    try {
        // Prova prima v2 (preprocessing avanzato)
        const dataV2Dir = path.join(process.cwd(), 'data', 'processed-v2');
        const v2Exists = await fs.access(path.join(dataV2Dir, 'metadata.json'))
            .then(() => true)
            .catch(() => false);
        
        if (v2Exists) {
            console.log('📚 Caricamento dati v2...');
            
            const metadata = JSON.parse(
                await fs.readFile(path.join(dataV2Dir, 'metadata.json'), 'utf8')
            );
            
            // Carica solo i file essenziali per ridurre memoria
            const searchIndex = await fs.readFile(path.join(dataV2Dir, 'search-index.json'), 'utf8')
                .then(data => JSON.parse(data))
                .catch(() => null);
            
            const semanticIndex = await fs.readFile(path.join(dataV2Dir, 'semantic-index.json'), 'utf8')
                .then(data => JSON.parse(data))
                .catch(() => null);
            
            const chunks0 = await fs.readFile(path.join(dataV2Dir, 'chunks_0.json'), 'utf8')
                .then(data => JSON.parse(data))
                .catch(() => []);
            
            if (chunks0.length > 0) {
                dataCache = {
                    metadata,
                    searchIndex,
                    semanticIndex,
                    chunks: chunks0,
                    dataDir: dataV2Dir,
                    version: 'v2'
                };
                
                console.log('✅ Dati v2 caricati');
                return dataCache;
            }
        }
        
        // Fallback a v1
        const dataV1Dir = path.join(process.cwd(), 'data', 'processed');
        const v1Exists = await fs.access(path.join(dataV1Dir, 'metadata.json'))
            .then(() => true)
            .catch(() => false);
        
        if (v1Exists) {
            console.log('📚 Caricamento dati v1...');
            
            const metadata = JSON.parse(
                await fs.readFile(path.join(dataV1Dir, 'metadata.json'), 'utf8')
            );
            
            const searchIndex = await fs.readFile(path.join(dataV1Dir, 'search-index.json'), 'utf8')
                .then(data => JSON.parse(data))
                .catch(() => null);
            
            const chunks0 = await fs.readFile(path.join(dataV1Dir, 'chunks_0.json'), 'utf8')
                .then(data => JSON.parse(data))
                .catch(() => []);
            
            if (chunks0.length > 0) {
                dataCache = {
                    metadata,
                    searchIndex,
                    chunks: chunks0,
                    dataDir: dataV1Dir,
                    version: 'v1'
                };
                
                console.log('✅ Dati v1 caricati');
                return dataCache;
            }
        }
        
        console.log('⚠️ Nessun dato preprocessato trovato');
        return null;
        
    } catch (error) {
        console.error('❌ Errore caricamento dati:', error.message);
        return null;
    }
}

/**
 * Ricerca chunks con strategia ottimizzata per Haiku
 */
async function searchRelevantChunksOptimized(questions, data, strategy) {
    const startTime = Date.now();
    const scores = new Map();
    
    // Combina e espande tutte le keywords
    let allKeywords = [];
    questions.forEach(q => {
        // Keywords originali
        allKeywords.push(...(q.keywords || []));
        
        // Estrai keywords aggiuntive dal testo della domanda
        const questionWords = extractKeywordsFromText(q.text);
        allKeywords.push(...questionWords);
        
        // Estrai keywords dalle opzioni
        Object.values(q.options || {}).forEach(option => {
            const optionWords = extractKeywordsFromText(option);
            allKeywords.push(...optionWords.slice(0, 2)); // Solo le prime 2 per evitare noise
        });
        
        // Aggiungi topic se disponibile
        if (q.topic) allKeywords.push(q.topic);
    });
    
    // Rimuovi duplicati e normalizza
    const uniqueKeywords = [...new Set(allKeywords)]
        .map(k => k.toLowerCase().trim())
        .filter(k => k.length > 2)
        .slice(0, 50); // Limita per performance
    
    if (!uniqueKeywords.length) {
        console.log('⚠️ Nessuna keyword valida estratta');
        return [];
    }
    
    console.log(`🔍 Ricerca ottimizzata per Haiku: ${uniqueKeywords.length} keywords`);
    console.log(`Top keywords: ${uniqueKeywords.slice(0, 8).join(', ')}`);
    
    // Ricerca multi-livello
    for (const keyword of uniqueKeywords) {
        if (Date.now() - startTime > strategy.searchTimeout) {
            console.log('⏱️ Timeout ricerca raggiunto');
            break;
        }
        
        // Livello 1: Ricerca semantica avanzata (se disponibile)
        if (strategy.useSemanticSearch && data.semanticIndex) {
            // Definizioni esatte - peso massimo
            if (data.semanticIndex.definitions?.[keyword]) {
                const def = data.semanticIndex.definitions[keyword];
                if (def.chunkId) {
                    scores.set(def.chunkId, (scores.get(def.chunkId) || 0) + 150);
                }
            }
            
            // Concetti correlati - peso alto
            if (data.semanticIndex.concepts?.[keyword]) {
                const chunks = data.semanticIndex.concepts[keyword];
                chunks.slice(0, 5).forEach(chunkId => {
                    scores.set(chunkId, (scores.get(chunkId) || 0) + 80);
                });
            }
        }
        
        // Livello 2: Ricerca standard ottimizzata
        if (data.metadata?.index) {
            const index = data.metadata.index;
            
            // Corrispondenze esatte - peso alto
            if (index[keyword]) {
                const chunkIds = index[keyword].chunks || [];
                chunkIds.slice(0, 8).forEach((chunkId, idx) => {
                    // Peso decrescente per posizione
                    const weight = 60 - (idx * 5);
                    scores.set(chunkId, (scores.get(chunkId) || 0) + weight);
                });
            }
            
            // Corrispondenze parziali - peso medio (solo se abbiamo tempo)
            if (Date.now() - startTime < strategy.searchTimeout * 0.6) {
                Object.entries(index).forEach(([word, wordData]) => {
                    if (word.includes(keyword) && word !== keyword) {
                        const chunkIds = wordData.chunks || [];
                        chunkIds.slice(0, 3).forEach(chunkId => {
                            scores.set(chunkId, (scores.get(chunkId) || 0) + 20);
                        });
                    }
                });
            }
        }
    }
    
    // Selezione intelligente dei migliori chunks
    const sortedChunks = Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, strategy.maxChunks);
    
    console.log(`📊 Trovati ${sortedChunks.length} chunks (scores: ${sortedChunks.slice(0, 5).map(([id, score]) => score).join(', ')})`);
    
    // Carica i chunks con diversificazione
    const chunks = [];
    const usedPages = new Set();
    
    // Prima passata: chunks con score alto da pagine diverse
    for (const [chunkId, score] of sortedChunks) {
        const chunk = await loadChunkById(chunkId, data);
        if (chunk) {
            // Diversifica per pagina per avere coverage migliore
            if (!usedPages.has(chunk.page) || usedPages.size < 5) {
                chunks.push({ ...chunk, score });
                usedPages.add(chunk.page);
            }
        }
        
        if (chunks.length >= strategy.maxChunks * 0.8) break;
    }
    
    // Seconda passata: riempi con chunks rimanenti se necessario
    if (chunks.length < strategy.maxChunks) {
        for (const [chunkId, score] of sortedChunks) {
            if (chunks.length >= strategy.maxChunks) break;
            
            const chunk = await loadChunkById(chunkId, data);
            if (chunk && !chunks.find(c => c.id === chunk.id)) {
                chunks.push({ ...chunk, score });
            }
        }
    }
    
    console.log(`📚 Caricati ${chunks.length} chunks da ${usedPages.size} pagine diverse`);
    return chunks;
}

/**
 * Estrae risposte e confidenza dalla risposta del modello
 */
function extractAnswersFromResponse(responseText) {
    try {
        const answers = [];
        
        // Cerca pattern nella tabella HTML o nel testo
        const tableMatches = responseText.match(/<tr>[\s\S]*?<\/tr>/g);
        
        if (tableMatches) {
            tableMatches.forEach(row => {
                const cellMatches = row.match(/>([^<]+)</g);
                if (cellMatches && cellMatches.length >= 2) {
                    const question = cellMatches[0].replace(/[<>]/g, '').trim();
                    const answer = cellMatches[1].replace(/[<>]/g, '').trim();
                    
                    if (question && ['A', 'B', 'C', 'D'].includes(answer)) {
                        answers.push({
                            question: parseInt(question) || answers.length + 1,
                            answer,
                            confidence: cellMatches[2] ? parseInt(cellMatches[2].replace(/[<>]/g, '').replace(/[^\d]/g, '')) : 0
                        });
                    }
                }
            });
        }
        
        // Fallback: cerca pattern nel testo libero
        if (answers.length === 0) {
            const textMatches = responseText.match(/Q\d+.*?([ABCD]).*?(\d{1,3})%/g);
            textMatches?.forEach((match, index) => {
                const answer = match.match(/[ABCD]/)?.[0];
                const confidence = match.match(/(\d{1,3})%/)?.[1];
                if (answer && confidence) {
                    answers.push({
                        question: index + 1,
                        answer,
                        confidence: parseInt(confidence)
                    });
                }
            });
        }
        
        return answers;
    } catch (error) {
        console.log('Errore estrazione risposte:', error.message);
        return [];
    }
}

/**
 * Valida la coerenza delle risposte con i chunks trovati
 */
function validateAnswerCoherence(answers, chunks, questions) {
    if (!answers.length || !chunks.length) {
        return { averageCoherence: 0, warning: 'Dati insufficienti per validazione' };
    }
    
    let totalCoherence = 0;
    const coherenceScores = [];
    
    answers.forEach((answer, index) => {
        const question = questions[index];
        if (!question) return;
        
        // Verifica se esistono chunks che supportano la risposta
        const relevantChunks = chunks.filter(chunk => {
            const chunkText = chunk.text.toLowerCase();
            const answerText = question.options[answer.answer]?.toLowerCase() || '';
            
            // Cerca corrispondenze tra il chunk e l'opzione scelta
            return question.keywords.some(keyword => 
                chunkText.includes(keyword.toLowerCase())
            ) || answerText.split(' ').some(word => 
                word.length > 3 && chunkText.includes(word)
            );
        });
        
        // Score di coerenza basato su supporto nel documento
        let coherenceScore = 0;
        if (relevantChunks.length > 0) {
            coherenceScore = Math.min(90, relevantChunks.length * 20); // Max 90%
        } else if (answer.confidence > 80) {
            coherenceScore = 10; // Penalizza alta confidenza senza supporto
        } else {
            coherenceScore = 50; // Confidenza bassa è onesta
        }
        
        coherenceScores.push({
            question: answer.question,
            coherence: coherenceScore,
            supportingChunks: relevantChunks.length,
            confidence: answer.confidence
        });
        
        totalCoherence += coherenceScore;
    });
    
    const averageCoherence = totalCoherence / answers.length;
    
    return {
        averageCoherence: Math.round(averageCoherence),
        details: coherenceScores,
        warning: averageCoherence < 40 ? 'BASSA COERENZA - Possibili risposte inventate' : null
    };
}

function extractKeywordsFromText(text) {
    if (!text) return [];
    
    // Stopwords italiane e inglesi comuni
    const stopwords = new Set([
        'il', 'la', 'di', 'che', 'in', 'un', 'è', 'per', 'con', 'non', 'una', 'su', 'le', 'da', 'si', 'come', 'più', 'questo', 'quale', 'cosa', 'quando', 'dove', 'perché',
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'this', 'that', 'which', 'what', 'how', 'why', 'when', 'where'
    ]);
    
    return text.toLowerCase()
        .replace(/[^\w\sàèéìíîòóù]/g, ' ') // Mantieni caratteri accentati italiani
        .split(/\s+/)
        .filter(word => 
            word.length > 3 && 
            !stopwords.has(word) &&
            !/^\d+$/.test(word) // Escludi solo numeri
        )
        .slice(0, 10); // Limita per evitare noise
}

/**
 * Carica un chunk specifico
 */
async function loadChunkById(chunkId, data) {
    if (!data.searchIndex || !data.searchIndex.chunkLocations) {
        // Cerca nei chunks già caricati
        return data.chunks.find(c => c.id === chunkId);
    }
    
    const location = data.searchIndex.chunkLocations[chunkId];
    if (!location) return null;
    
    // Se è nel primo file, già caricato
    if (location.file === 'chunks_0.json') {
        return data.chunks[location.index];
    }
    
    // Carica il file necessario
    try {
        const chunkFilePath = path.join(data.dataDir, location.file);
        const chunks = JSON.parse(await fs.readFile(chunkFilePath, 'utf8'));
        return chunks[location.index];
    } catch (error) {
        return null;
    }
}

/**
 * Genera prompt di estrazione ottimizzato per Haiku
 */
function generateOptimizedExtractionPrompt(imageMetadata) {
    let basePrompt = `ESTRAZIONE QUIZ - MASSIMA PRECISIONE

ANALISI STEP-BY-STEP:
1. Scansiona metodicamente l'immagine dall'alto verso il basso
2. Identifica ogni numero di domanda (1, 2, 3, etc.)
3. Per ogni domanda, trascrivi il testo COMPLETO ed ESATTO
4. Identifica tutte le opzioni (A, B, C, D) con testo integrale
5. Genera 6-8 keywords TECNICHE SPECIFICHE per cercare nel documento

STRATEGIA KEYWORDS AVANZATA:
- Termini tecnici precisi dalla domanda
- Concetti chiave e definizioni specifiche
- Nomi di processi, formule, principi
- Sinonimi scientifici/accademici
- Evita parole generiche (cosa, come, processo, funzione)

ESEMPIO OTTIMO:
Domanda: "Quale processo permette alle piante di convertire CO2 in glucosio?"
Keywords: ["fotosintesi", "clorofilla", "glucosio", "anidride carbonica", "ATP", "ciclo Calvin", "luce solare", "stomi"]

FORMATO RICHIESTO:`;

    if (imageMetadata && imageMetadata.estimatedQuality === 'low') {
        basePrompt += `\n\nATTENZIONE QUALITÀ BASSA: Se parti del testo non sono leggibili, usa "TESTO_NON_LEGGIBILE" nel campo corrispondente.`;
    }

    basePrompt += `
{
  "questions": [
    {
      "number": 1,
      "text": "testo completo esatto della domanda",
      "options": {
        "A": "testo completo opzione A",
        "B": "testo completo opzione B", 
        "C": "testo completo opzione C",
        "D": "testo completo opzione D"
      },
      "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6"],
      "topic": "argomento specifico",
      "difficulty": "facile|medio|difficile"
    }
  ]
}

IMPORTANTE: Solo JSON valido, nessun testo extra.`;

    return basePrompt;
}

/**
 * Genera prompt di analisi massimamente ottimizzato per Haiku con tabella semplificata
 */
function generateOptimizedAnalysisPrompt(globalContext, questions, imageMetadata, strategy) {
    let basePrompt = `ANALISI QUIZ - OUTPUT SINTETICO

CONTESTO DOCUMENTO (${globalContext ? 'DISPONIBILE' : 'LIMITATO'}):
${globalContext || 'ATTENZIONE: Contesto ridotto - basa l\'analisi su conoscenza generale'}

DOMANDE DA ANALIZZARE:`;

    // Aggiungi domande in modo conciso per risparmiare token
    questions.forEach((q, index) => {
        basePrompt += `\n\nQ${q.number}: ${q.text}
A) ${q.options.A || 'N/A'} B) ${q.options.B || 'N/A'} C) ${q.options.C || 'N/A'} D) ${q.options.D || 'N/A'}`;
    });

    basePrompt += `\n\n**OUTPUT RICHIESTO (IMPORTANTE: SEGUI ESATTAMENTE QUESTO FORMATO):**

GENERA QUESTO HTML ESATTO:

<table class="quiz-results-table">
<thead>
<tr>
<th>N°</th>
<th>Risposta</th>
<th>Accuratezza</th>
</tr>
</thead>
<tbody>`;
    
    questions.forEach(q => {
        basePrompt += `
<tr>
<td class="question-number">${q.number}</td>
<td class="answer-letter">[INSERISCI SOLO A, B, C o D]</td>
<td class="accuracy-percentage">[INSERISCI NUMERO]%</td>
</tr>`;
    });
    
    basePrompt += `
</tbody>
</table>

DOPO LA TABELLA, per ogni domanda aggiungi:

<div class="question-analysis">
<h4>Domanda ${questions[0]?.number || '1'}</h4>
<p class="question-text">[Trascrivi il testo completo della domanda]</p>
<p class="answer-explanation"><strong>Risposta: [LETTERA]</strong> - [Spiegazione breve]</p>
<p class="source-info">Fonte: [Pagina X del documento O Conoscenza generale]</p>
</div>

IMPORTANTE:
- Inserisci SOLO lettere A, B, C o D nella colonna risposta
- Usa percentuali realistiche (90-100% se sicuro, 60-80% se probabile, 40-60% se incerto)
- NON aggiungere stili CSS inline
- Mantieni ESATTAMENTE la struttura HTML indicata`;

    if (imageMetadata && imageMetadata.estimatedQuality === 'low') {
        basePrompt += '\n\nNOTA: Immagine a bassa qualità, possibili errori di lettura.';
    }

    return basePrompt;
}

DOPO LA TABELLA:
Aggiungi una breve analisi (MAX 2 righe per domanda) con il ragionamento chiave.

IMPORTANTE:
- Nella tabella inserisci SOLO la lettera della risposta (A, B, C o D)
- Non aggiungere colonne extra
- Mantieni la tabella pulita e semplice
- L'analisi dettagliata va DOPO la tabella, non dentro`;

    if (imageMetadata && imageMetadata.estimatedQuality === 'low') {
        basePrompt += '\n\nNOTA: Considera possibili errori di lettura dell\'immagine.';
    }

    return basePrompt;
}

/**
 * Genera prompt di analisi finale con risultati preliminari
 */
function generateFinalAnalysisPrompt(globalContext, questions, preliminaryAnalysis, imageMetadata, strategy) {
    let basePrompt = `ANALISI FINALE QUIZ - TABELLA SINTETICA

CONTESTO DOCUMENTO:
${globalContext || 'Contesto limitato disponibile'}

${preliminaryAnalysis ? `ANALISI PRELIMINARE COMPLETATA:
${preliminaryAnalysis.analysis.map(a => 
`Q${a.question}: ${a.topic}
- Opzioni probabili: ${a.likely_answers.join(', ')}
- Copertura documento: ${a.document_coverage}
`).join('\n')}

TASK: Conferma la risposta definitiva per ogni domanda.` : 'TASK: Analisi diretta delle domande.'}

DOMANDE:`;

    questions.forEach((q, index) => {
        basePrompt += `\n\nQ${q.number}: ${q.text}
A) ${q.options.A} B) ${q.options.B} C) ${q.options.C} D) ${q.options.D}`;
    });

    basePrompt += `\n\n**RISPOSTA FINALE RICHIESTA:**

1. TABELLA A 3 COLONNE (SENZA STILI INLINE):
<table class="quiz-results-table">
<thead>
<tr>
<th>N°</th>
<th>Risposta</th>
<th>Accuratezza</th>
</tr>
</thead>
<tbody>`;
    
    questions.forEach(q => {
        basePrompt += `
<tr>
<td class="question-number">${q.number}</td>
<td class="answer-letter">[A/B/C/D]</td>
<td class="accuracy-percentage">[XX%]</td>
</tr>`;
    });
    
    basePrompt += `
</tbody>
</table>

2. ANALISI DETTAGLIATA per ogni domanda con formato:
<div class="question-analysis">
<h4>Domanda [numero]</h4>
<p class="question-text">[testo domanda]</p>
<p class="answer-explanation"><strong>Risposta: [lettera]</strong> - [spiegazione]</p>
<p class="source-info">Fonte: [riferimento]</p>
</div>`;

ANALISI CONCISA:
Per ogni domanda, una riga di spiegazione.`;

    return basePrompt;
}

/**
 * Handler principale con approccio ibrido
 */
export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-processing-mode, x-image-metadata');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Gestione richiesta GET per test di connessione
    if (req.method === 'GET') {
        console.log('🔧 Test di connessione ricevuto');
        
        const apiKey = process.env.ANTHROPIC_API_KEY;
        const hasApiKey = !!apiKey;
        const keyPreview = hasApiKey ? `${apiKey.substring(0, 10)}...` : 'NON CONFIGURATA';
        
        return res.status(200).json({
            status: 'ok',
            message: 'Quiz Assistant API attiva',
            timestamp: new Date().toISOString(),
            version: '2.0-hybrid-haiku',
            features: {
                anthropicApiKey: hasApiKey,
                apiKeyPreview: keyPreview,
                documentProcessing: true,
                imageAnalysis: true,
                dualStageAnalysis: true,
                simplifiedOutput: true
            },
            endpoints: {
                analyze: 'POST /api/analyze-smart',
                test: 'GET /api/analyze-smart'
            },
            debug: {
                nodeVersion: process.version,
                platform: process.platform
            }
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            allowedMethods: ['GET', 'POST', 'OPTIONS']
        });
    }

    try {
        console.log('🚀 Avvio analisi quiz...');
        
        const apiKey = process.env.ANTHROPIC_API_KEY;
        
        if (!apiKey) {
            console.error('❌ API key Anthropic mancante');
            return res.status(500).json({ 
                error: 'API key Anthropic non configurata sul server',
                hint: 'Imposta ANTHROPIC_API_KEY nelle variabili d\'ambiente'
            });
        }

        // Estrai immagine e analizza metadati
        const messageContent = req.body.messages[0].content;
        const imageContent = messageContent.find(c => c.type === 'image');
        
        if (!imageContent) {
            return res.status(400).json({ 
                error: 'Immagine quiz non trovata nella richiesta' 
            });
        }

        const imageMetadata = extractImageMetadata(messageContent);
        console.log('📊 Metadati immagine:', imageMetadata);

        const strategy = determineProcessingStrategy(imageMetadata, req.headers);
        console.log('🎯 Strategia ibrida:', {
            extraction: strategy.extractionModel,
            analysis: strategy.analysisModel,
            maxChunks: strategy.maxChunks,
            useSemanticSearch: strategy.useSemanticSearch
        });

        // Carica dati preprocessati
        const data = await loadProcessedData();
        
        // Se non ci sono dati, usa analisi diretta
        if (!data || !data.chunks || data.chunks.length === 0) {
            console.log('⚠️ Uso analisi diretta senza documento');
            return directAnalysisWithoutDoc(req, res, apiKey, imageContent, imageMetadata, strategy);
        }

        console.log(`📖 Analisi con documento preprocessato (${data.version})`);

        // STEP 1: Estrazione domande ottimizzata per Haiku
        console.log('📤 Estrazione domande ottimizzata...');
        const extractionPrompt = generateOptimizedExtractionPrompt(imageMetadata);
        
        const extractResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: strategy.extractionModel,
                max_tokens: strategy.extractionMaxTokens,
                temperature: 0.1,
                messages: [{
                    role: 'user',
                    content: [imageContent, { type: 'text', text: extractionPrompt }]
                }]
            })
        });

        if (!extractResponse.ok) {
            const errorData = await extractResponse.json();
            throw new Error(errorData.error?.message || 'Errore estrazione domande');
        }

        const extractData = await extractResponse.json();
        
        // Parse domande con error handling migliorato
        let questions;
        try {
            let jsonText = extractData.content[0].text;
            console.log('Risposta raw dall\'estrazione (primi 200 caratteri):', jsonText.substring(0, 200));
            
            // Rimuovi eventuali markdown code blocks
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            // Cerca di trovare l'inizio del JSON
            const jsonStart = jsonText.indexOf('{');
            if (jsonStart > 0) {
                jsonText = jsonText.substring(jsonStart);
            }
            
            // Cerca di trovare la fine del JSON
            const jsonEnd = jsonText.lastIndexOf('}');
            if (jsonEnd > 0 && jsonEnd < jsonText.length - 1) {
                jsonText = jsonText.substring(0, jsonEnd + 1);
            }
            
            console.log('JSON pulito (primi 200 caratteri):', jsonText.substring(0, 200));
            
            if (jsonText.startsWith('{') && jsonText.includes('questions')) {
                const parsed = JSON.parse(jsonText);
                questions = parsed.questions;
                
                // Validazione domande - rimuovo il requisito delle keywords che potrebbe causare problemi
                questions = questions.filter(q => 
                    q.number && q.text && q.options && 
                    Object.keys(q.options).length >= 2
                );
                
                // Aggiungi keywords vuote se mancano
                questions = questions.map(q => ({
                    ...q,
                    keywords: q.keywords || []
                }));
                
                console.log(`✅ Estratte ${questions.length} domande valide`);
                
                if (questions.length === 0) {
                    throw new Error('Nessuna domanda valida estratta');
                }
            } else {
                throw new Error('Formato non JSON valido o mancante campo questions');
            }
        } catch (e) {
            console.error('⚠️ Parsing fallito:', e.message);
            console.error('Risposta completa:', extractData.content[0].text);
            return directAnalysisWithDoc(req, res, apiKey, imageContent, data, imageMetadata, strategy);
        }

        // STEP 2: Ricerca chunks ottimizzata per Haiku con debug
        console.log('🔍 Ricerca chunks con strategia ottimizzata...');
        const relevantChunks = await searchRelevantChunksOptimized(questions, data, strategy);
        
        // DEBUG: Log dettagliato dei chunks trovati
        console.log('=== DEBUG CHUNKS TROVATI ===');
        console.log(`Totale chunks: ${relevantChunks.length}`);
        if (relevantChunks.length > 0) {
            console.log('Top 3 chunks:');
            relevantChunks.slice(0, 3).forEach((chunk, idx) => {
                console.log(`${idx + 1}. [Pag.${chunk.page}] Score:${chunk.score} - ${chunk.text.substring(0, 100)}...`);
            });
            console.log('Pagine referenziate:', [...new Set(relevantChunks.map(c => c.page))].sort());
        }
        
        // DEBUG: Log keywords utilizzate
        const allKeywords = questions.flatMap(q => q.keywords || []);
        console.log('Keywords estratte:', allKeywords.slice(0, 10));
        console.log('===============================');
        
        if (relevantChunks.length === 0) {
            console.log('⚠️ ATTENZIONE: Nessun chunk trovato - potrebbe causare risposte inventate');
        }
        
        console.log(`📚 Utilizzo ${relevantChunks.length} chunks per l'analisi`);

        // STEP 3: Costruisci contesto ottimizzato per Haiku
        const maxContextLength = strategy.analysisMaxTokens * 0.6; // 60% dei token per contesto
        let currentLength = 0;
        const selectedChunks = [];
        
        // Ordina per score e seleziona fino al limite di token
        relevantChunks
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .forEach(chunk => {
                const chunkText = `[Pag. ${chunk.page}] ${chunk.text}`;
                const estimatedTokens = Math.ceil(chunkText.length / 4); // Stima 4 char = 1 token
                
                if (currentLength + estimatedTokens < maxContextLength) {
                    selectedChunks.push(chunkText);
                    currentLength += estimatedTokens;
                }
            });

        const globalContext = selectedChunks.join('\n\n---\n\n');
        
        console.log(`📄 Contesto costruito: ~${currentLength} token stimati`);

        // STEP 4: Analisi finale ottimizzata per Haiku con tabella semplificata
        console.log(`🎯 Analisi finale con tabella sintetica...`);
        const finalAnalysisPrompt = generateOptimizedAnalysisPrompt(globalContext, questions, imageMetadata, strategy);
        
        const analyzeResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: strategy.analysisModel,
                max_tokens: strategy.analysisMaxTokens,
                temperature: 0.05, // Temperatura più bassa per decisioni finali
                messages: [{
                    role: 'user',
                    content: [imageContent, { type: 'text', text: finalAnalysisPrompt }]
                }]
            })
        });

        if (!analyzeResponse.ok) {
            const errorData = await analyzeResponse.json();
            console.error('❌ Errore API Anthropic:', {
                status: analyzeResponse.status,
                statusText: analyzeResponse.statusText,
                error: errorData
            });
            throw new Error(`API Error ${analyzeResponse.status}: ${errorData.error?.message || errorData.message || 'Errore sconosciuto'}`);
        }

        const analyzeData = await analyzeResponse.json();
        
        // STEP 5: Validazione coerenza risultati (CRITICO per evitare false confidenze)
        console.log('🔍 Validazione coerenza risultati...');
        
        try {
            // Estrai le risposte dalla risposta del modello per validazione
            const responseText = analyzeData.content[0].text;
            const answers = extractAnswersFromResponse(responseText);
            
            if (answers && answers.length > 0) {
                console.log('=== VALIDAZIONE COERENZA ===');
                console.log('Risposte estratte:', answers.map(a => `Q${a.question}: ${a.answer} (${a.confidence}%)`));
                
                // Verifica coerenza con chunks trovati
                const coherenceCheck = validateAnswerCoherence(answers, relevantChunks, questions);
                console.log('Score di coerenza:', coherenceCheck);
                
                if (coherenceCheck.averageCoherence < 40) {
                    console.log('⚠️ ATTENZIONE: Bassa coerenza rilevata - possibili risposte inventate');
                }
                console.log('===============================');
            }
        } catch (validationError) {
            console.log('Errore validazione (non critico):', validationError.message);
        }
        
        // Risposta con metadata estesi e warning se necessario
        console.log('✅ Analisi completata con successo');
        
        res.status(200).json({
            content: analyzeData.content,
            metadata: {
                processingMethod: 'optimized-haiku-simplified-table',
                extractionModel: strategy.extractionModel,
                analysisModel: strategy.analysisModel,
                questionsAnalyzed: questions.length,
                chunksSearched: relevantChunks.length,
                pagesReferenced: [...new Set(relevantChunks.map(c => c.page))].length,
                contextTokensUsed: currentLength,
                documentUsed: true,
                imageMetadata,
                strategy: {
                    searchTimeout: strategy.searchTimeout,
                    maxChunks: strategy.maxChunks,
                    useSemanticSearch: strategy.useSemanticSearch,
                    enhancedKeywords: strategy.enhancedKeywords
                },
                performance: {
                    totalChunksAvailable: data.chunks.length,
                    searchEfficiency: Math.round((relevantChunks.length / strategy.maxChunks) * 100),
                    contextOptimization: Math.round((currentLength / (strategy.analysisMaxTokens * 0.6)) * 100)
                }
            }
        });

    } catch (error) {
        console.error('❌ Errore:', error);
        res.status(500).json({ 
            error: error.message || 'Errore interno del server',
            timestamp: new Date().toISOString(),
            debug: {
                stack: error.stack,
                name: error.name
            }
        });
    }
}

/**
 * Analisi diretta con documento - tabella semplificata
 */
async function directAnalysisWithDoc(req, res, apiKey, imageContent, data, imageMetadata, strategy) {
    console.log('📋 Analisi diretta con documento di supporto');
    
    try {
        const sampleSize = Math.min(strategy.maxChunks, 12);
        const sampleChunks = data.chunks
            .sort(() => Math.random() - 0.5)
            .slice(0, sampleSize)
            .map(chunk => `[Pag. ${chunk.page}] ${chunk.text}`)
            .join('\n\n---\n\n');
        
        let prompt = `CONTESTO DAL DOCUMENTO (campione):
${sampleChunks}

${imageMetadata ? `METADATI IMMAGINE:
- Qualità: ${imageMetadata.estimatedQuality} (${imageMetadata.sizeKB}KB)
${imageMetadata.estimatedQuality === 'low' ? '- NOTA: Qualità bassa, possibili difficoltà di lettura' : ''}

` : ''}Analizza il quiz nell'immagine e fornisci:

1. Una tabella HTML con ESATTAMENTE questa struttura:
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
<td class="accuracy-percentage">85%</td>
</tr>
<!-- continua per ogni domanda -->
</tbody>
</table>

2. Per ogni domanda, aggiungi sotto la tabella:
<div class="question-analysis">
<h4>Domanda 1</h4>
<p class="question-text">[testo domanda]</p>
<p class="answer-explanation"><strong>Risposta: B</strong> - [spiegazione]</p>
<p class="source-info">Fonte: [riferimento]</p>
</div>

IMPORTANTE: USA SOLO LE CLASSI CSS INDICATE, NESSUNO STILE INLINE.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: strategy.analysisModel,
                max_tokens: strategy.analysisMaxTokens,
                temperature: 0.1,
                messages: [{
                    role: 'user',
                    content: [imageContent, { type: 'text', text: prompt }]
                }]
            })
        });

        const data_response = await response.json();
        
        if (!response.ok) {
            console.error('Errore API in directAnalysisWithDoc:', data_response);
            throw new Error(data_response.error?.message || 'Errore API');
        }

        res.status(200).json({
            content: data_response.content,
            metadata: {
                processingMethod: 'direct-with-context-simplified',
                analysisModel: strategy.analysisModel,
                documentUsed: true,
                searchQuality: 'sample',
                imageMetadata,
                contextSize: sampleSize
            }
        });
        
    } catch (error) {
        console.error('Errore in directAnalysisWithDoc:', error);
        // Prova fallback ancora più semplice
        return simpleDirectAnalysis(req, res, apiKey, imageContent, imageMetadata, strategy);
    }
}

/**
 * Analisi semplice di fallback
 */
async function simpleDirectAnalysis(req, res, apiKey, imageContent, imageMetadata, strategy) {
    console.log('📋 Uso analisi semplice di fallback');
    
    try {
        let prompt = `Analizza il quiz nell'immagine.

Per ogni domanda che vedi, fornisci:
1. Il numero della domanda
2. La lettera della risposta corretta (A, B, C o D)
3. Una percentuale di accuratezza
4. Una breve spiegazione

Formatta la risposta come una semplice tabella HTML e poi aggiungi le spiegazioni.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 3000,
                temperature: 0.1,
                messages: [{
                    role: 'user',
                    content: [imageContent, { type: 'text', text: prompt }]
                }]
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Errore anche nel fallback:', data);
            throw new Error(data.error?.message || 'Errore API');
        }

        res.status(200).json({
            content: data.content,
            metadata: {
                processingMethod: 'simple-fallback',
                analysisModel: 'claude-3-haiku-20240307',
                documentUsed: false,
                warning: 'Analisi semplificata senza documento'
            }
        });
        
    } catch (error) {
        console.error('Errore critico:', error);
        res.status(500).json({ 
            error: 'Errore nell\'analisi del quiz. Verifica che l\'immagine sia leggibile.',
            details: error.message 
        });
    }
}

/**
 * Analisi diretta senza documento - tabella semplificata
 */
async function directAnalysisWithoutDoc(req, res, apiKey, imageContent, imageMetadata, strategy) {
    console.log('📋 Analisi diretta senza documento');
    
    try {
        let prompt = `Analizza il quiz nell'immagine.

${imageMetadata ? `METADATI IMMAGINE:
- Qualità stimata: ${imageMetadata.estimatedQuality} (${imageMetadata.sizeKB}KB)
${imageMetadata.estimatedQuality === 'low' ? '- ATTENZIONE: Immagine a bassa qualità' : ''}

` : ''}IMPORTANTE: Non ho accesso al documento di riferimento, userò la conoscenza generale.

GENERA:

1. TABELLA A 3 COLONNE (USA SOLO CLASSI CSS, NO STILI INLINE):
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
<td class="answer-letter">[A/B/C/D]</td>
<td class="accuracy-percentage">[XX%]</td>
</tr>
<!-- continua per tutte le domande -->
</tbody>
</table>

2. ANALISI DETTAGLIATA:
<div class="question-analysis">
<h4>Domanda [numero]</h4>
<p class="question-text">[trascrivi domanda completa]</p>
<p class="answer-explanation"><strong>Risposta: [lettera]</strong> - [spiegazione]</p>
<p class="source-info">Fonte: Conoscenza generale (documento non disponibile)</p>
</div>

Nota: le percentuali saranno basse (40-60%) senza documento di riferimento.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: strategy.analysisModel,
                max_tokens: strategy.analysisMaxTokens,
                temperature: 0.1,
                messages: [{
                    role: 'user',
                    content: [imageContent, { type: 'text', text: prompt }]
                }]
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Errore in directAnalysisWithoutDoc:', data);
            throw new Error(data.error?.message || 'Errore API');
        }

        res.status(200).json({
            content: data.content,
            metadata: {
                processingMethod: 'direct-no-document-simplified',
                analysisModel: strategy.analysisModel,
                documentUsed: false,
                imageMetadata,
                warning: `Analisi basata solo su conoscenza generale${imageMetadata && imageMetadata.estimatedQuality === 'low' ? ' con immagine a bassa qualità' : ''}`
            }
        });
        
    } catch (error) {
        console.error('Errore in directAnalysisWithoutDoc:', error);
        // Prova con fallback semplice
        return simpleDirectAnalysis(req, res, apiKey, imageContent, imageMetadata, strategy);
    }
}