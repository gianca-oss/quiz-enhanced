// api/analyze.js - Funzione serverless corretta per Vercel

export default async function handler(req, res) {
  // Abilita CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Metodo non permesso. Usa POST.' 
    });
  }

  try {
    // Log per debug
    console.log('Richiesta ricevuta');
    
    // Prendi l'API key dalle variabili d'ambiente
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.error('API key mancante nelle variabili ambiente');
      return res.status(500).json({ 
        error: 'API key non configurata sul server. Contatta l\'amministratore.' 
      });
    }

    // Verifica che il body sia presente
    if (!req.body) {
      return res.status(400).json({ 
        error: 'Body della richiesta mancante' 
      });
    }

    console.log('Invio richiesta ad Anthropic...');

    // Fai la richiesta ad Anthropic
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    // Leggi la risposta
    const responseText = await anthropicResponse.text();
    
    // Prova a parsare come JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Errore parsing risposta:', responseText);
      return res.status(500).json({ 
        error: 'Risposta non valida da Anthropic',
        details: responseText.substring(0, 200)
      });
    }

    // Se la risposta non è ok, ritorna l'errore
    if (!anthropicResponse.ok) {
      console.error('Errore Anthropic:', data);
      
      // Gestisci errori specifici
      if (anthropicResponse.status === 401) {
        return res.status(401).json({ 
          error: 'API key non valida o scaduta' 
        });
      }
      
      if (anthropicResponse.status === 429) {
        return res.status(429).json({ 
          error: 'Limite di rate raggiunto. Riprova tra qualche secondo.' 
        });
      }
      
      if (anthropicResponse.status === 400) {
        return res.status(400).json({ 
          error: data.error?.message || 'Richiesta non valida' 
        });
      }
      
      // Errore generico
      return res.status(anthropicResponse.status).json({
        error: data.error?.message || data.message || 'Errore nella chiamata ad Anthropic',
        type: data.error?.type || 'unknown_error'
      });
    }

    // Successo - ritorna la risposta
    console.log('Risposta ricevuta con successo');
    res.status(200).json(data);

  } catch (error) {
    // Errore generale del server
    console.error('Errore server:', error);
    
    // Costruisci un messaggio di errore leggibile
    let errorMessage = 'Errore interno del server';
    
    if (error.message) {
      errorMessage = error.message;
    }
    
    if (error.cause) {
      errorMessage += ' - ' + error.cause;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}