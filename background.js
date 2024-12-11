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
    // Important: return true to indicate async response
    return true;
  }
});

let lastClipboardContent = '';

// Check clipboard periodically
async function checkClipboard() {
  try {
    // Get active tab to execute script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Skip chrome:// and edge:// URLs
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
      return;
    }

    // Read clipboard through content script
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

    const text = result[0]?.result;
    if (text && text !== lastClipboardContent) {
      lastClipboardContent = text;
      handleNewClip(text);
    }
  } catch (error) {
    // Silently ignore errors for restricted pages
    if (!error.message.includes('Cannot access')) {
      console.error('Error checking clipboard:', error);
    }
  }
}

// Start monitoring clipboard
setInterval(checkClipboard, 1000);

// Handle new clipboard content
async function handleNewClip(text) {
  try {
    // Get current clips and settings
    const { recentClips = [], maxClips = 50 } = await chrome.storage.local.get(['recentClips', 'maxClips']);
    
    // Check if this clip already exists
    if (recentClips.some(clip => clip.text === text)) {
      return;
    }

    // Create new clip
    const newClip = {
      id: Date.now(),
      text,
      timestamp: new Date().toISOString()
    };

    // Add to beginning and respect maxClips limit
    const updatedClips = [newClip, ...recentClips].slice(0, maxClips);

    // Save to storage
    await chrome.storage.local.set({ recentClips: updatedClips });

    // Notify popup if open
    chrome.runtime.sendMessage({
      action: 'updateClips',
      clips: updatedClips
    }).catch(() => {
      // Ignore error if popup is not open
      console.log('Popup not open for update');
    });
  } catch (error) {
    console.error('Error handling new clip:', error);
  }
}
