import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Configuration, OpenAIApi } from 'https://esm.sh/openai@3.1.0'

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY')
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  // Habilitar CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Headers recebidos:', {
      authorization: req.headers.get('authorization')?.substring(0, 20) + '...',
      contentType: req.headers.get('content-type'),
      method: req.method,
      allHeaders: Object.fromEntries(req.headers.entries())
    });

    // Verificar se tem token de autorização
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Token de autorização ausente ou inválido:', { 
        hasAuth: !!authHeader,
        startsWithBearer: authHeader?.startsWith('Bearer '),
        authPreview: authHeader?.substring(0, 20) + '...'
      });
      return new Response(
        JSON.stringify({ 
          error: 'Token de autorização ausente ou inválido',
          details: {
            hasAuth: !!authHeader,
            startsWithBearer: authHeader?.startsWith('Bearer ')
          }
        }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Clonar a requisição antes de consumir o corpo
    const reqClone = req.clone();
    const { query, clips } = await req.json();

    // Validar os parâmetros
    console.log('Corpo da requisição recebido:', {
      query,
      clips,
      queryType: typeof query,
      clipsType: typeof clips,
      clipsIsArray: Array.isArray(clips),
      clipsLength: clips?.length,
      fullRequest: await reqClone.text()
    });

    if (!query || !clips || !Array.isArray(clips) || clips.length === 0) {
      console.error('Parâmetros inválidos:', { 
        query, 
        clipsType: typeof clips, 
        isArray: Array.isArray(clips),
        bodyPreview: JSON.stringify({ query, clips }).substring(0, 200) + '...'
      });
      return new Response(
        JSON.stringify({ 
          error: 'Query e clips são obrigatórios e clips deve ser um array não vazio',
          details: {
            query, 
            clipsType: typeof clips, 
            isArray: Array.isArray(clips)
          }
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Fazer a requisição para a API do Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        system: "You are a semantic search assistant that ONLY outputs JSON. Your task is to analyze the texts and find semantically relevant ones for the search query. You MUST return ONLY a JSON object like {\"relevant_indices\": [1]} containing the 1-based indices of relevant texts. NEVER include explanations or text.",
        messages: [
          {
            role: 'user',
            content: `Find semantically relevant texts for this query: "${query}"\n\nTexts:\n${clips.map((clip, i) => `${i + 1}. ${clip}`).join('\n')}\n\nRespond ONLY with a JSON object containing relevant_indices array.`
          }
        ],
        max_tokens: 1000,
        temperature: 0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro na API do Claude:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorText,
        prompt: query,
        clips: clips,
        CLAUDE_API_KEY_LENGTH: CLAUDE_API_KEY?.length
      });
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao processar a busca semântica',
          details: {
            status: response.status,
            statusText: response.statusText
          }
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const claudeResponse = await response.json();
    console.log('Resposta do Claude:', claudeResponse);
    
    try {
      // A resposta do Claude vem no formato { content: [{ text: "..." }] }
      const responseText = claudeResponse.content[0].text;
      console.log('Texto da resposta:', responseText);
      
      // Tentar fazer o parse do JSON
      let parsedContent;
      try {
        parsedContent = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Erro ao fazer parse do JSON:', {
          error: parseError,
          responseText: responseText
        });
        // Se falhar o parse, tentar extrair apenas a parte JSON da resposta
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContent = JSON.parse(jsonMatch[0]);
        } else {
          throw parseError;
        }
      }

      // Verificar se temos os índices relevantes
      if (!parsedContent.relevant_indices || !Array.isArray(parsedContent.relevant_indices)) {
        throw new Error('Resposta inválida do Claude: relevant_indices não encontrado ou inválido');
      }

      // Mapear os índices para os textos correspondentes
      const results = parsedContent.relevant_indices
        .map(index => clips[index - 1])
        .filter(text => text); // Remove undefined/null values

      return new Response(
        JSON.stringify({ 
          success: true,
          results: results
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      console.error('Erro ao processar resposta do Claude:', {
        error: error,
        response: claudeResponse
      });
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao processar resultados da busca',
          details: {
            message: error.message,
            response: claudeResponse
          }
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('Erro na Edge Function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: {
          name: error.name,
          stack: error.stack
        }
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
})
