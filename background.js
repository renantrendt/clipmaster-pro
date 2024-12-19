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

    // Skip checking clipboard for chrome:// and edge:// URLs
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
      return;
    }

    // Skip checking clipboard for extension pages
    if (tab.url.includes('chrome-extension://')) {
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
    // Only log errors that aren't related to expected scenarios
    if (!error.message.includes('Cannot access contents of url') && 
        !error.message.includes('chrome-extension://')) {
      console.error('Error checking clipboard:', error);
    }
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
    const allClips = [...recentClips, ...favoriteClips].map(clip => clip.text);
    
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

    return { 
      success: true, 
      results: data.results,
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
