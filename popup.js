import { SearchBar } from './js/components/SearchBar.js';
import './js/components/HeaderActions.js';
import ClipList from './js/components/ClipList.js';

// Register the custom element
customElements.define('clip-list', ClipList);

let currentTab = 'recent';
let isPro = false;
let isPinned = false;
let recentClips = [];
let favoriteClips = [];
let searchBar;

let processedRecentClips = new Set();
let processedFavoriteClips = new Set();
let remainingRecentClips = [];

const DEFAULT_RECENT_LIMIT = 50;
const DEFAULT_FAVORITES_LIMIT = 10;
const PRO_LIMIT = 1000;
let pinnedWindowId = null;

let updateInterval;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup opened');
  try {
    await initializePopup();
    setupEventListeners();
    setupSettingsModal();
    await initializeSettings();
    await checkProStatus();
    setupProHints();
    await updateProButton();
    
    // Add event listener for tab changes from the custom component
    const tabsComponent = document.querySelector('app-tabs');
    tabsComponent.addEventListener('tab-change', (event) => {
      const activeTab = event.detail.activeTab;
      switchTab(activeTab);
    });
    
    // Start polling if window is already pinned on load
    const headerActions = document.querySelector('header-actions');
    const pinButton = headerActions.shadowRoot.getElementById('pinBtn');
    if (pinButton.classList.contains('active')) {
      startPolling();
    }
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
});

async function initializePopup() {
  try {
    // Initialize SearchBar first
    searchBar = new SearchBar({
      onSearch: (query) => searchBar.performSearch(false),
      onAISearch: (query) => searchBar.performSearch(true),
      onClear: updateUI,
      onLoadMore: () => loadClips(true),
      onUpdateUI: updateUI,
      getCurrentTab: () => currentTab,
      isPro: isPro
    });
    searchBar.init(document.getElementById('searchBarContainer'));
    searchBar.updateSearchState();

    // Set initial tab state
    const recentTab = document.querySelector('.tab-btn[data-tab="recent"]');
    const recentList = document.querySelector('.clip-list[data-tab="recent"]');
    if (recentTab && recentList) {
      recentTab.classList.add('active');
      recentList.classList.add('active');
    }

    // Load initial clips
    currentTab = 'recent';
    await loadClips(false);
    
    // Check if window is already pinned
    const { pinnedWindow } = await chrome.storage.local.get('pinnedWindow');
    if (pinnedWindow) {
      const pinButton = document.getElementById('pinBtn');
      pinButton.classList.add('active');
      startPolling();
    }
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
}

// Listener for messages from background
chrome.runtime.onMessage.addListener((message) => {
  console.log('Message received in popup:', message);
  
  if (message.action === 'updateClips') {
    updateUI();
  }
});

async function updateRecentList(recentClips, favoriteClips) {
  console.log('Updating recent list with', recentClips.length, 'clips');
  
  const recentList = document.getElementById('recentClipsList');
  if (!recentList) {
    console.error('Recent list element not found');
    return;
  }
  
  // Clear the list
  recentList.innerHTML = '';
  
  if (recentClips.length === 0) {
    return;
  }
  
  // Add each clip
  recentClips.forEach(clip => {
    const isFavorite = favoriteClips.some(f => f.text === clip.text);
    const clipElement = createClipElement(clip, isFavorite);
    recentList.appendChild(clipElement);
  });
}

// Configure event listeners
function setupEventListeners() {
  // Settings Modal
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => toggleModal('settingsModal', true));
  }

  const proBtn = document.getElementById('proBtn');
  if (proBtn) {
    proBtn.addEventListener('click', async () => {
      const { isPro } = await chrome.storage.local.get(['isPro']);
      const modalId = isPro ? 'proStatusModal' : 'proModal';
      toggleModal(modalId, true);
    });
  }
  
  // Close buttons for modals
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) {
        toggleModal(modal.id, false);
      }
    });
  });

  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
      toggleModal(event.target.id, false);
    }
  });
  
  // Pin Button
  const pinBtn = document.getElementById('pinBtn');
  if (pinBtn) {
    pinBtn.addEventListener('click', async () => {
      await togglePin();
      if (isPinned) {
        startPolling();
      } else {
        stopPolling();
      }
    });
  }
  
  // Export/Import
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportFavorites);
  }

  const importBtn = document.getElementById('importBtn');
  if (importBtn) {
    importBtn.addEventListener('click', importFavorites);
  }
}

async function switchTab(tab) {
  if (!tab) return;
  
  // Remove search more button when switching tabs
  searchBar.removeSearchMoreButton();
  
  // Update current tab
  currentTab = tab;
  
  // Remove active class from all tabs and lists
  document.querySelectorAll('.tab-btn, clip-list').forEach(el => {
    el.classList.remove('active');
  });
  
  // Add active class to selected tab and list
  const selectedTab = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  const selectedList = document.querySelector(`clip-list[type="${tab}"]`);
  
  if (selectedTab) selectedTab.classList.add('active');
  if (selectedList) {
    selectedList.classList.add('active');
    // Trigger re-render of the list
    selectedList.setAttribute('type', tab);
  }
  
  // Update tabs component
  const tabsComponent = document.querySelector('app-tabs');
  if (tabsComponent) {
    tabsComponent.setAttribute('current-tab', tab);
  }
  
  // Load clips for the current tab
  await loadClips(false);
}

async function loadClips(loadMore = false) {
  try {
    const { recentClips, favoriteClips } = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
    
    // Sanitize clips before serialization
    const sanitizedRecentClips = (recentClips || [])
      .map(clip => ({
        text: clip.text || '',
        timestamp: clip.timestamp || Date.now(),
        id: clip.id || crypto.randomUUID(),
        type: 'recent'
      }))
      .filter(clip => clip.text.trim() !== '');
    
    const sanitizedFavoriteClips = (favoriteClips || [])
      .map(clip => ({
        text: clip.text || '',
        timestamp: clip.timestamp || Date.now(),
        id: clip.id || crypto.randomUUID(),
        type: 'favorite'
      }))
      .filter(clip => clip.text.trim() !== '');
    
    const recentList = document.querySelector('clip-list[type="recent"]');
    const favoriteList = document.querySelector('clip-list[type="favorite"]');
    
    if (recentList) {
      try {
        // Use ultra-safe serialization
        const safeRecentClipsJson = safeJsonStringify(sanitizedRecentClips);
        console.log('Recent clips JSON:', safeRecentClipsJson);
        recentList.setAttribute('clips', safeRecentClipsJson);
      } catch (serializeError) {
        console.error('Error serializing recent clips:', serializeError);
        recentList.setAttribute('clips', '[]');
      }
    }
    
    if (favoriteList) {
      try {
        // Use ultra-safe serialization
        const safeFavoriteClipsJson = safeJsonStringify(sanitizedFavoriteClips);
        console.log('Favorite clips JSON:', safeFavoriteClipsJson);
        favoriteList.setAttribute('clips', safeFavoriteClipsJson);
      } catch (serializeError) {
        console.error('Error serializing favorite clips:', serializeError);
        favoriteList.setAttribute('clips', '[]');
      }
    }
    
    // Update the current tab's list
    const currentList = document.querySelector(`clip-list[type="${currentTab}"]`);
    if (currentList) {
      const clipsToShow = currentTab === 'recent' ? sanitizedRecentClips : sanitizedFavoriteClips;
      try {
        // Use ultra-safe serialization
        const safeCurrentClipsJson = safeJsonStringify(clipsToShow);
        console.log(`${currentTab} clips JSON:`, safeCurrentClipsJson);
        currentList.setAttribute('clips', safeCurrentClipsJson);
      } catch (serializeError) {
        console.error('Error serializing current tab clips:', serializeError);
        currentList.setAttribute('clips', '[]');
      }
    }
    
    // Optional: Update search bar, but only if it's initialized
    if (searchBar && typeof searchBar.updateSearchState === 'function') {
      searchBar.updateSearchState();
    }
  } catch (error) {
    console.error('Error loading clips:', error);
  }
}

// Ultra-safe JSON serialization
function safeJsonStringify(obj) {
  // Handle different input types
  if (obj === null || obj === undefined) return '{}';
  
  try {
    // Custom replacer to handle non-serializable values
    return JSON.stringify(obj, (key, value) => {
      // Handle special cases
      if (value === undefined) return null;
      if (typeof value === 'function') return value.toString();
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }
      
      // Escape problematic characters
      if (typeof value === 'string') {
        return value
          .replace(/\\/g, '\\\\')   // Escape backslashes
          .replace(/"/g, '\\"')     // Escape quotes
          .replace(/\n/g, '\\n')    // Escape newlines
          .replace(/\r/g, '\\r')    // Escape carriage returns
          .replace(/\t/g, '\\t');   // Escape tabs
      }
      
      return value;
    }, 2);  // Use indentation for readability
  } catch (error) {
    console.error('Safe JSON stringify failed:', error);
    return '{}';
  }
}

// Utility function to safely escape text for JSON
function escapeJsonString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')   // Escape backslashes first
    .replace(/"/g, '\\"')     // Escape double quotes
    .replace(/\n/g, '\\n')    // Escape newlines
    .replace(/\r/g, '\\r')    // Escape carriage returns
    .replace(/\t/g, '\\t')    // Escape tabs
    .replace(/\f/g, '\\f')    // Escape form feeds
    .replace(/\v/g, '\\v');   // Escape vertical tabs
}

// Utility function to sanitize clip for JSON serialization
function sanitizeClip(clip) {
  if (!clip) return null;
  
  const sanitized = {
    text: escapeJsonString(clip.text || ''),
    timestamp: clip.timestamp || Date.now(),
    id: clip.id || crypto.randomUUID(),
    type: clip.type || 'recent'
  };
  
  // Remove any non-serializable properties
  Object.keys(sanitized).forEach(key => {
    if (sanitized[key] === undefined) {
      delete sanitized[key];
    }
  });
  
  return sanitized;
}

// Token limit for chunk processing
const TOKEN_LIMIT = 1000;

// Get next chunk of clips based on token limit
function getNextChunk(clips, tokenLimit) {
  const chunk = [];
  let currentTokenCount = 0;

  for (const clip of clips) {
    // Estimate token count (simple approximation)
    const clipTokenCount = clip.text ? clip.text.length / 4 : 0;
    
    if (currentTokenCount + clipTokenCount <= tokenLimit) {
      chunk.push(clip);
      currentTokenCount += clipTokenCount;
    } else {
      break;
    }
  }

  return chunk;
}

// Update list
async function updateList(listId, clips, favoriteClips) {
  const clipList = document.getElementById(listId);
  
  if (clipList) {
    // Determine which clips to render based on the list ID
    const clipsToRender = listId === 'recentClipsList' 
      ? clips 
      : (listId === 'favoriteClipsList' ? favoriteClips : []);
    
    // Set clips attribute to trigger rendering
    clipList.setAttribute('clips', JSON.stringify(clipsToRender));
  }
}

// Event listener for clip actions
document.addEventListener('clip-copied', (event) => {
  console.log('Clip copied:', event.detail.clip);
  // Add any additional copy logic
});

document.addEventListener('toggle-favorite', (event) => {
  const { clip, index, currentType } = event.detail;
  
  if (currentType === 'recent') {
    addToFavorites(clip);
  } else {
    removeFromFavorites(clip);
  }
});

// Create clip item
function createClipElement(clip, isFavorite = false) {
  const clipElement = document.createElement('div');
  clipElement.className = 'clip-item';
  
  const textElement = document.createElement('div');
  textElement.className = 'clip-text';
  textElement.textContent = clip.text;
  
  const favoriteButton = document.createElement('button');
  favoriteButton.className = 'action-btn favorite-btn' + (isFavorite ? ' active' : '');
  favoriteButton.innerHTML = `<svg width="10" height="14" viewBox="0 0 14 18" stroke="currentColor" fill="${isFavorite ? 'currentColor' : 'none'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l-6-4-6 4V3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"></path></svg>`;
  favoriteButton.title = isFavorite ? 'Remove from favorites' : 'Add to favorites';
  
  // Prevent click event from bubbling up when clicking the favorite button
  favoriteButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(clip);
  });
  
  // Add click handler to the whole clip item
  clipElement.addEventListener('click', async () => {
    try {
      // Copy to clipboard
      await navigator.clipboard.writeText(clip.text);
      
      // Visual feedback
      clipElement.classList.add('clicked');
      
      // Get current window to check if we're in the pinned window
      const currentWindow = await chrome.windows.getCurrent();
      const { pinnedWindowId: storedPinnedWindowId } = await chrome.storage.local.get('pinnedWindowId');
      
      // Only try to send message if we're not in the pinned window
      if (currentWindow.id !== storedPinnedWindowId) {
        try {
          // Get active tab and send paste message
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && !tab.url.includes('chrome-extension://')) {
            await chrome.tabs.sendMessage(tab.id, { action: 'paste', text: clip.text });
          }
        } catch (msgError) {
          // Ignore message sending errors as they're expected in some cases
          console.debug('Message not sent:', msgError.message);
        }
        
        // Close popup after a short delay
        setTimeout(() => window.close(), 100);
      } else {
        // Se estamos na janela pinada, apenas dê feedback visual temporário
        setTimeout(() => {
          clipElement.classList.remove('clicked');
        }, 300);
      }
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      clipElement.classList.remove('clicked');
    }
  });
  
  clipElement.appendChild(textElement);
  clipElement.appendChild(favoriteButton);
  
  return clipElement;
}

// Configure max clips controls
function setupMaxClipsControls() {
  const input = document.getElementById('maxClips');
  if (!input) {
    console.log('Max clips input not found');
    return;
  }

  const decrease = document.querySelector('.decrease');
  const increase = document.querySelector('.increase');
  
  // Keyboard arrows
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      incrementMaxClips(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      incrementMaxClips(-1);
    }
  });
  
  // Buttons
  if (decrease) {
    decrease.addEventListener('click', () => incrementMaxClips(-1));
  }
  if (increase) {
    increase.addEventListener('click', () => incrementMaxClips(1));
  }
}

function incrementMaxClips(delta) {
  const input = document.getElementById('maxClips');
  if (!input) {
    console.log('Max clips input not found');
    return;
  }

  const currentValue = parseInt(input.value) || 50;
  const newValue = Math.max(10, Math.min(50, currentValue + delta));
  
  if (newValue > 50 && !isPro) {
    showProUpgradeModal();
    return;
  }
  
  input.value = Math.max(10, Math.min(isPro ? 1000 : 50, newValue));
}

// Load settings
async function loadSettings() {
  const settings = await chrome.storage.local.get(['windowSize', 'maxClips', 'maxFavorites']);
  
  if (settings.windowSize) {
    document.documentElement.style.width = settings.windowSize.width + 'px';
    document.documentElement.style.height = settings.windowSize.height + 'px';
  }
  
  // Set max clips value
  const maxClips = document.getElementById('maxClips');
  const maxFavorites = document.getElementById('maxFavorites');
  
  if (maxClips) {
    maxClips.value = settings.maxClips || DEFAULT_RECENT_LIMIT;
  }
  
  if (maxFavorites) {
    maxFavorites.value = settings.maxFavorites || DEFAULT_FAVORITES_LIMIT;
  }
}

// Toggle Pin
async function togglePin() {
  // Check if we're in the pinned window
  const currentWindow = await chrome.windows.getCurrent();
  console.log('Current window:', currentWindow.id);
  console.log('Pinned window ID:', pinnedWindowId);
  const isCurrentWindowPinned = currentWindow.id === pinnedWindowId;
  console.log('Is current window pinned?', isCurrentWindowPinned);

  // If we're in the pinned window, just close it and reset state
  if (isCurrentWindowPinned) {
    console.log('Closing pinned window...');
    isPinned = false;
    pinnedWindowId = null;
    
    // Save state before closing
    await chrome.storage.local.set({ 
      isPinned: false,
      pinnedWindowId: null 
    });
    
    // Close the window
    try {
      await chrome.windows.remove(currentWindow.id);
    } catch (error) {
      console.error('Error closing window:', error);
    }
    return;
  }
  
  isPinned = !isPinned;
  console.log('Toggle pin state to:', isPinned);
  
  // Save the state
  chrome.storage.local.set({ isPinned }, () => {
    console.log('Pin state saved:', isPinned);
  });
  
  // Update UI
  updatePinButton();
  
  if (isPinned) {
    try {
      // Get screen dimensions
      const { width: screenWidth, height: screenHeight } = window.screen;
      
      // Calculate initial size (50% of screen size)
      const initialWidth = Math.max(screenWidth * 0.5, 300);
      const initialHeight = Math.max(screenHeight * 0.7, 400);
      
      // Calculate position to center the window
      const left = Math.round((screenWidth - initialWidth) / 2);
      const top = Math.round((screenHeight - initialHeight) / 2);
      
      // Create new popup window
      const newWindow = await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: Math.round(initialWidth),
        height: Math.round(initialHeight),
        left: left,
        top: top,
        focused: true
      });
      
      pinnedWindowId = newWindow.id;
      // Save pinnedWindowId to storage
      await chrome.storage.local.set({ pinnedWindowId });
      window.close();
    } catch (error) {
      console.error('Error creating pinned window:', error);
      isPinned = false;
      pinnedWindowId = null;
      await chrome.storage.local.set({ 
        isPinned: false,
        pinnedWindowId: null 
      });
      updatePinButton();
    }
  } else if (pinnedWindowId) {
    try {
      await chrome.windows.remove(pinnedWindowId);
      pinnedWindowId = null;
      await chrome.storage.local.set({ pinnedWindowId: null });
    } catch (error) {
      console.error('Error closing pinned window:', error);
    }
  }
}

// Listener for when a window is closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === pinnedWindowId) {
    console.log('Pinned window was closed');
    // Reset state
    isPinned = false;
    pinnedWindowId = null;
    // Save new state
    chrome.storage.local.set({ 
      isPinned: false,
      pinnedWindowId: null 
    }, () => {
      console.log('Pin state reset after window close');
    });
  }
});

// Check if there's already a pinned window on startup
async function checkPinnedWindow() {
  try {
    if (!isPinned) return;
    
    const windows = await chrome.windows.getAll();
    const currentWindow = await chrome.windows.getCurrent();
    
    // If this is a popup window and isPinned is true, update pinnedWindowId
    if (currentWindow.type === 'popup') {
      // Check if the pinned window still exists
      const pinnedWindowExists = windows.some(window => window.id === pinnedWindowId);
      if (!pinnedWindowExists) {
        console.log('Pinned window not found in check, resetting state');
        isPinned = false;
        pinnedWindowId = null;
        chrome.storage.local.set({ 
          isPinned: false,
          pinnedWindowId: null 
        });
        updatePinButton();
      } else {
        pinnedWindowId = currentWindow.id;
      }
    }
  } catch (error) {
    console.error('Error checking pinned window:', error);
  }
}



// Save settings
async function saveSettings() {
  const maxClips = document.getElementById('maxClips').value;
  await chrome.storage.local.set({ maxClips: parseInt(maxClips) });
  toggleModal('settingsModal', false);
}

// Clip management
async function addClip(text) {
  if (!text) return;
  
  try {
    const { maxClips = DEFAULT_RECENT_LIMIT } = await chrome.storage.local.get(['maxClips']);
    
    // Remove duplicates
    recentClips = recentClips.filter(clip => clip.text !== text);
    
    // Add new clip at the beginning
    recentClips.unshift({
      id: Date.now(),
      text,
      timestamp: new Date().toISOString()
    });
    
    // Enforce limit
    recentClips = recentClips.slice(0, maxClips);
    
    // Save and update UI
    await saveClips();
    updateRecentList(recentClips, favoriteClips);
    
    // Add search more button if needed
    searchBar.handleSearchMoreButton('recentClipsList');
  } catch (error) {
    console.error('Error adding clip:', error);
  }
}

async function toggleFavorite(clip) {
  try {
    const { isPro, maxFavorites = 5, recentClips: savedRecent = [] } = await chrome.storage.local.get(['isPro', 'maxFavorites', 'recentClips']);
    const isFavorite = favoriteClips.some(f => f.text === clip.text);
    
    if (!isFavorite) {
      // Check favorites limit for free users
      if (!isPro && favoriteClips.length >= maxFavorites) {
        const proModal = document.getElementById('proModal');
        if (proModal) {
          proModal.style.display = 'block';
        }
        return;
      }
      
      // Add to favorites
      favoriteClips.unshift({ ...clip, timestamp: new Date().toISOString() });
      favoriteClips = favoriteClips.slice(0, maxFavorites); // Ensure limit
    } else {
      // Remove from favorites
      favoriteClips = favoriteClips.filter(f => f.text !== clip.text);
    }
    
    await saveClips();
    
    // Update local recentClips with saved data
    recentClips = savedRecent;
    
    // Check if we're in a search
    const query = searchBar.getValue();
    if (query) {
      // Re-run the search to update the filtered results
      searchBar.performSearch(searchBar.isSemanticSearchActive);
    } else {
      // Update both lists to reflect changes
      if (currentTab === 'recent') {
        updateList('recentClipsList', recentClips, favoriteClips);
    
    // Add search more button if needed
    searchBar.handleSearchMoreButton('recentClipsList');
      } else {
        updateList('favoriteClipsList', favoriteClips, favoriteClips);
      }
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
  }
}

async function moveToTop(clip) {
  const index = recentClips.findIndex(c => c.text === clip.text);
  if (index > 0) {
    recentClips.splice(index, 1);
    recentClips.unshift(clip);
    await saveClips();
    updateUI();
  }
}

// Storage
async function saveClips() {
  await chrome.storage.local.set({
    recentClips,
    favoriteClips
  });
}

// UI Helpers




// Stripe Integration
async function startCheckout() {
  // Activate Pro features locally
  isPro = true;
  await chrome.storage.local.set({ isPro: true });
  
  // Update limits
  const settings = {
    maxClips: PRO_LIMIT,
    maxFavorites: PRO_LIMIT
  };
  await chrome.storage.local.set(settings);
  
  // Update UI
  document.getElementById('proModal').style.display = 'none';
  await updateProButton();
  
  // Remove Pro hints
  document.querySelectorAll('.pro-hint').forEach(hint => {
    hint.style.display = 'none';
  });
  
  // Enable search
  searchBar.updateSearchState();
  
  // Update UI
  await loadSettings();
  updateUI();
}

// Check Pro status
async function checkProStatus() {
  const data = await chrome.storage.local.get(['isPro']);
  isPro = data.isPro || false;
  
  if (isPro) {
    await updateProButton();
    document.querySelectorAll('.pro-hint').forEach(hint => {
      hint.style.display = 'none';
    });
    
    searchBar.updateSearchState();
  }
  
  return isPro;
}

// Show Pro upgrade modal
function showProUpgradeModal() {
  const proModal = document.getElementById('proModal');
  if (proModal) {
    proModal.style.display = 'block';
    
    // Configure the upgrade button
    const upgradeBtn = proModal.querySelector('#upgradeBtn');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', async () => {
        await startCheckout();
      });
    }
  }
}

async function updateProButton() {
  const data = await chrome.storage.local.get(['isPro']);
  const isPro = data.isPro || false;
  
  const proBtn = document.getElementById('proBtn');
  if (proBtn) {
    proBtn.textContent = isPro ? 'Pro' : 'Free';
    proBtn.title = isPro ? 'Pro Version' : 'Upgrade to Pro';
    proBtn.className = isPro ? 'pro-btn is-pro' : 'pro-btn';
  }
}

function updatePinButton() {
  const pinBtn = document.getElementById('pinBtn');
  if (pinBtn) {
    pinBtn.classList.toggle('active', isPinned);
    pinBtn.title = isPinned ? 'Unpin window' : 'Pin window';
  }
}

// Toggle modal visibility
function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = show ? 'block' : 'none';
    if (show && modalId === 'settingsModal') {
      const maxClipsInput = document.getElementById('maxClips');
      if (maxClipsInput) maxClipsInput.focus();
    }
  }
}

// Setup settings modal
function setupSettingsModal() {
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeBtn = settingsModal?.querySelector('.close-btn');
  const saveBtn = document.getElementById('saveSettingsBtn');

  if (settingsBtn) {
    settingsBtn.addEventListener('click', async () => {
      const data = await chrome.storage.local.get(['isPro', 'maxClips', 'maxFavorites']);
      const isPro = data.isPro || false;
      
      // Update limits based on Pro status
      const maxClipsInput = document.getElementById('maxClips');
      const maxFavoritesInput = document.getElementById('maxFavorites');
      
      if (isPro) {
        if (maxClipsInput) {
          maxClipsInput.removeAttribute('max');
          maxClipsInput.removeAttribute('disabled');
          // If the current value is the default or less than the non-Pro limit, set to 1000
          if (!data.maxClips || data.maxClips <= 50) {
            maxClipsInput.value = '1000';
          }
        }
        if (maxFavoritesInput) {
          maxFavoritesInput.removeAttribute('max');
          maxFavoritesInput.removeAttribute('disabled');
          // If the current value is the default or less than the non-Pro limit, set to 1000
          if (!data.maxFavorites || data.maxFavorites <= 5) {
            maxFavoritesInput.value = '1000';
          }
        }
        
        // Hide Pro hints
        document.querySelectorAll('.pro-hint').forEach(hint => {
          hint.style.display = 'none';
        });
      } else {
        if (maxClipsInput) {
          maxClipsInput.setAttribute('max', '50');
          maxClipsInput.value = Math.min(parseInt(maxClipsInput.value) || 50, 50);
        }
        if (maxFavoritesInput) {
          maxFavoritesInput.setAttribute('max', '5');
          maxFavoritesInput.value = Math.min(parseInt(maxFavoritesInput.value) || 5, 5);
        }
      }
      
      settingsModal.style.display = 'block';
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const maxClipsInput = document.getElementById('maxClips');
      const maxFavoritesInput = document.getElementById('maxFavorites');
      
      const settings = {
        maxClips: parseInt(maxClipsInput.value) || DEFAULT_RECENT_LIMIT,
        maxFavorites: parseInt(maxFavoritesInput.value) || DEFAULT_FAVORITES_LIMIT
      };
      
      await chrome.storage.local.set(settings);
      settingsModal.style.display = 'none';
      
      // Update UI
      await loadClips();
      await loadFavorites();
    });
  }

  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });
}

// Initialize settings
async function initializeSettings() {
  const data = await chrome.storage.local.get(['maxClips', 'maxFavorites', 'isPro']);
  const isPro = data.isPro || false;
  const maxLimit = isPro ? PRO_LIMIT : DEFAULT_RECENT_LIMIT;
  const maxFavLimit = isPro ? PRO_LIMIT : DEFAULT_FAVORITES_LIMIT;
  
  const maxClipsInput = document.getElementById('maxClips');
  if (maxClipsInput) {
    maxClipsInput.value = data.maxClips || 50;
    maxClipsInput.max = maxLimit;
    if (isPro) {
      maxClipsInput.removeAttribute('disabled');
    }
  }

  const maxFavoritesInput = document.getElementById('maxFavorites');
  if (maxFavoritesInput) {
    maxFavoritesInput.value = data.maxFavorites || DEFAULT_FAVORITES_LIMIT;
    maxFavoritesInput.max = maxFavLimit;
    if (isPro) {
      maxFavoritesInput.removeAttribute('disabled');
    }
  }
  
  // Hide Pro hints if user is Pro
  if (isPro) {
    document.querySelectorAll('.pro-hint').forEach(hint => {
      hint.style.display = 'none';
    });
  }
}

// Setup Pro hints click handlers
function setupProHints() {
  const proHints = document.querySelectorAll('.pro-hint');
  const proModal = document.getElementById('proModal');
  const upgradeBtn = document.getElementById('upgradeBtn');

  // Event listener for the upgrade button
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', async () => {
      await startCheckout();
      await updateProButton();
    });
  }

  proHints.forEach(hint => {
    hint.addEventListener('click', () => {
      if (proModal) {
        proModal.style.display = 'block';
      }
    });
  });

  // Event listener for the close button
  const closeBtn = proModal?.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      proModal.style.display = 'none';
    });
  }
}

// UI update function
async function updateUI(searchResults = null, searchFavorites = null) {
  try {
    const { recentClips = [], favoriteClips = [] } = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
    
    if (currentTab === 'recent') {
      updateList('recentClipsList', searchResults || recentClips, searchFavorites || favoriteClips);
    } else {
      updateList('favoriteClipsList', searchResults || favoriteClips, searchFavorites || favoriteClips);
    }
    
    searchBar.updateSearchState();
    updateProButton();
    updatePinButton();
  } catch (error) {
    console.error('Error updating UI:', error);
  }
}

// Start polling when window is pinned
function startPolling() {
  if (updateInterval) return;
  console.log('Starting clip polling...');
  updateInterval = setInterval(async () => {
    const { recentClips = [], favoriteClips = [] } = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
    updateList('recentClipsList', recentClips, favoriteClips);
    
    // Add search more button if needed
    searchBar.handleSearchMoreButton('recentClipsList');
    updateList('favoriteClipsList', favoriteClips, favoriteClips);
  }, 1000); // Check every second
}

// Stop polling when window is unpinned
function stopPolling() {
  if (updateInterval) {
    console.log('Stopping clip polling...');
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const proModal = document.getElementById('proModal');
  const closeBtn = proModal.querySelector('.close-btn');
  const upgradeBtn = document.getElementById('upgradeBtn');

  closeBtn.addEventListener('click', () => {
    proModal.style.display = 'none';
  });

  upgradeBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ isPro: true });
    proModal.style.display = 'none';
    await updateProButton();
    
    // If there's text in the search field, perform semantic search automatically
    searchBar.triggerAISearch();
  });

  window.addEventListener('click', (event) => {
    if (event.target === proModal) {
      proModal.style.display = 'none';
    }
  });
});

// Inicialização do popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Inicializa o popup primeiro
    await initializePopup();

    // Configura event listeners
    setupEventListeners();

    // Configura modal de configurações
    setupSettingsModal();

    // Carrega configurações
    await loadSettings();

    // Configura controles de clips máximos
    setupMaxClipsControls();

    // Configura botão de atualização pro
    updateProButton();

    // Configura dicas pro
    setupProHints();

    // Inicializa configurações
    initializeSettings();

    // Configura botão de pin
    updatePinButton();

    // Configura modais
    const proModal = document.getElementById('proModal');
    if (proModal) {
      const closeBtn = proModal.querySelector('.close-btn');
      const upgradeBtn = document.getElementById('upgradeBtn');

      if (closeBtn) {
        closeBtn.addEventListener('click', () => toggleModal('proModal', false));
      }

      if (upgradeBtn) {
        upgradeBtn.addEventListener('click', startCheckout);
      }
    }
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
});
