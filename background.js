import CONFIG from './config.js';

// Initialize storage when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
  chrome.storage.local.get(['recentClips', 'favoriteClips', 'maxClips'], function(result) {
    if (!result.recentClips) {
      chrome.storage.local.set({ recentClips: [] });
      console.log('Storage initialized: recentClips');
    }
    if (!result.favoriteClips) {
      chrome.storage.local.set({ favoriteClips: [] });
      console.log('Storage initialized: favoriteClips');
    }
    if (!result.maxClips) {
      chrome.storage.local.set({ maxClips: 50 });
      console.log('Storage initialized: maxClips');
    }
  });
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
    if (!tab) return;

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
      return;
    }

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return new Promise((resolve) => {
          navigator.clipboard.readText()
            .then(text => resolve(text))
            .catch(() => resolve(''));
        });
      }
    });

    const clipboardContent = result[0].result;
    if (clipboardContent && clipboardContent !== lastClipboardContent) {
      lastClipboardContent = clipboardContent;
      await handleNewClip(clipboardContent);
    }
  } catch (error) {
    console.error('Error checking clipboard:', error);
  }
}

// Start monitoring clipboard
setInterval(checkClipboard, 1000);

// Handle new clipboard content
async function handleNewClip(text) {
  try {
    if (!text || typeof text !== 'string') return;

    const { recentClips = [], maxClips = 50 } = await chrome.storage.local.get(['recentClips', 'maxClips']);
    
    // Get current tab info for metadata
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const newClip = {
      id: Date.now(),
      text,
      timestamp: new Date().toISOString(),
      app: tab?.url ? new URL(tab.url).hostname : 'unknown',
      title: tab?.title || 'unknown',
      url: tab?.url || 'unknown',
      copiedAt: new Date().toISOString()
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
    
    // Criar dois arrays: um para exibição e outro para busca
    const displayClips = [...recentClips, ...favoriteClips].filter(clip => clip && clip.text);
    const searchClips = displayClips.map(clip => 
      `${clip.text} (From: ${clip.app || 'unknown'} | Title: ${clip.title || 'unknown'} | URL: ${clip.url || 'unknown'} | Copied: ${clip.copiedAt || 'unknown'})`
    );
    
    // Log para debug
    console.log('Sending semantic search request:', {
      query,
      clips: searchClips
    });

    const response = await fetch('https://vsqjdfxsbgdlmihbzmcr.supabase.co/functions/v1/semantic-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        query,
        clips: searchClips
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to perform semantic search: ${response.status}`);
    }

    const data = await response.json();
    
    // Log para debug
    console.log('Semantic search response:', data);

    if (data.error) {
      throw new Error(data.error);
    }

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error('Invalid response format from search');
    }

    // Mapear os índices de volta para os clips originais, filtrando índices inválidos
    const validResults = data.results
      .map(index => displayClips[index - 1])
      .filter(clip => clip && clip.text);

    return { 
      success: true, 
      results: validResults,
      debug: {
        totalClips: searchClips.length,
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
