import CONFIG from '/config.js';
import { migrateData, CURRENT_VERSION } from '/js/migrations.js';

// Initialize storage and handle migrations when extension is installed or updated
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);

  // Executar migração de dados
  await migrateData();

  // Inicializar valores padrão se necessário
  const result = await chrome.storage.local.get(['recentClips', 'favoriteClips', 'maxClips']);
  
  if (!result.recentClips) {
    await chrome.storage.local.set({ recentClips: [] });
    console.log('Storage initialized: recentClips');
  }
  if (!result.favoriteClips) {
    await chrome.storage.local.set({ favoriteClips: [] });
    console.log('Storage initialized: favoriteClips');
  }
  if (!result.maxClips) {
    await chrome.storage.local.set({ maxClips: 50 });
    console.log('Storage initialized: maxClips');
  }
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'copyToClipboard') {
    handleNewClip(message.text);
    return true;
  } else if (message.action === 'semanticSearch') {
    handleSemanticSearch(message.query)
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

let lastClipboardContent = '';

// Check clipboard periodically
async function checkClipboard() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    // Lista de URLs que devemos ignorar
    const skipUrls = [
      'chrome://',
      'edge://',
      'chrome-extension://',
      'about:',
      'file:',
      'view-source:'
    ];

    // Verifica se a URL atual deve ser ignorada
    if (skipUrls.some(url => tab.url?.startsWith(url))) {
      return;
    }

    // Verifica se a página está carregada corretamente
    if (tab.status !== 'complete' || tab.url === '') {
      return;
    }

    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return new Promise((resolve) => {
            navigator.clipboard.readText()
              .then(text => resolve({ success: true, text }))
              .catch(error => resolve({ success: false, error: error.message }));
          });
        }
      });

      if (!result || !result[0] || !result[0].result) return;

      const { success, text, error } = result[0].result;
      if (!success) {
        console.debug('Clipboard access denied:', error);
        return;
      }

      if (text && text !== lastClipboardContent) {
        lastClipboardContent = text;
        await handleNewClip(text);
      }
    } catch (scriptError) {
      // Ignora erros específicos que são esperados
      const expectedErrors = [
        'Cannot access contents of url',
        'Frame with ID',
        'The extensions gallery cannot be scripted',
        'Missing host permission for the tab'
      ];

      if (!expectedErrors.some(msg => scriptError.message?.includes(msg))) {
        console.error('Script execution error:', scriptError);
      }
    }
  } catch (error) {
    // Log apenas erros inesperados
    console.error('Unexpected error in checkClipboard:', error);
  }
}

// Start monitoring clipboard
setInterval(checkClipboard, 1000);

// Handle new clipboard content
async function handleNewClip(text) {
  try {
    if (!text || typeof text !== 'string') return;

    const { recentClips = [], maxClips = 50 } = await chrome.storage.local.get(['recentClips', 'maxClips']);
    
    // Get active tab information
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const newClip = {
      id: Date.now(),
      text,
      timestamp: new Date().toISOString(),
      appName: activeTab?.title?.split(' - ').pop() || 'Unknown', // Usually the app name is the last part of the title
      tabTitle: activeTab?.title || 'Unknown',
      tabUrl: activeTab?.url || 'Unknown'
    };

    const existingIndex = recentClips.findIndex(clip => clip.text === text);
    if (existingIndex !== -1) {
      recentClips.splice(existingIndex, 1);
    }

    recentClips.unshift(newClip);
    
    while (recentClips.length > maxClips) {
      recentClips.pop();
    }

    await chrome.storage.local.set({ recentClips });
  } catch (error) {
    console.error('Error handling new clip:', error);
  }
}

// Handle semantic search
async function handleSemanticSearch(query) {
  try {
    const { recentClips, favoriteClips } = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
    const allClips = [...recentClips, ...favoriteClips].map(clip => {
      // Combine clip text with its metadata into a single searchable string
      let searchableText = clip.text;
      if (clip.appName) searchableText += ` | App: ${clip.appName}`;
      if (clip.tabTitle) searchableText += ` | Tab: ${clip.tabTitle}`;
      if (clip.tabUrl) searchableText += ` | URL: ${clip.tabUrl}`;
      return searchableText;
    });
    
    // Log para debug
    console.log('Sending semantic search request:', {
      query,
      clips: allClips
    });

    const response = await fetch('https://vsqjdfxsbgdlmihbzmcr.supabase.co/functions/v1/semantic-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        query,
        clips: allClips
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to perform semantic search: ${response.status}`);
    }

    const data = await response.json();
    
    // Log para debug
    console.log('Semantic search response from Supabase:', data);

    if (data.error) {
      throw new Error(data.error);
    }

    // A Edge Function retorna os resultados diretamente
    if (!data.results || !Array.isArray(data.results)) {
      console.warn('Invalid response format:', data);
      return { success: false, error: 'Invalid response format from search' };
    }

    // Map the results back to original clip texts (removing metadata)
    const results = data.results.map(result => {
      return result.split(' | ')[0]; // Get only the original text part
    });

    return { 
      success: true, 
      results,
      debug: { // Incluir informações de debug na resposta
        totalClips: allClips.length,
        responseData: data
      }
    };
  } catch (error) {
    console.error('Error in semantic search:', error);
    return { 
      success: false, 
      error: error.message,
      debug: { error } // Incluir o erro completo para debug
    };
  }
}
