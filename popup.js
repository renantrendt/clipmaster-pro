// Utility functions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

let currentTab = 'recent';
let isPro = false;
let isPinned = false;
let recentClips = [];
let favoriteClips = [];
let isSemanticSearchActive = false;
let lastSearchResults = null;
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
    
    // Start polling if window is already pinned on load
    const pinButton = document.getElementById('pinBtn');
    if (pinButton.classList.contains('active')) {
      startPolling();
    }
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
});

async function initializePopup() {
  try {
    await switchTab('recent');
    
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
  
  const recentList = document.getElementById('recentList');
  if (!recentList) {
    console.error('Recent list element not found');
    return;
  }
  
  // Clear the list
  recentList.innerHTML = '';
  
  if (recentClips.length === 0) {
    showEmptyState(false);
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
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      if (tab) {
        switchTab(tab);
      }
    });
  });

  // Search input
  const searchInput = document.getElementById('searchInput');
  const debouncedSearch = debounce(() => performSearch(false), 300);
  searchInput.addEventListener('input', debouncedSearch);
  
  // Handle cursor style for the X button
  searchInput.addEventListener('mousemove', (e) => {
    const rect = searchInput.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width - 24 && searchInput.value) {
      searchInput.style.cursor = 'pointer';
    } else {
      searchInput.style.cursor = 'text';
    }
  });
  
  searchInput.addEventListener('mouseleave', () => {
    searchInput.style.cursor = 'text';
  });

  // Handle click on the X button
  searchInput.addEventListener('click', (e) => {
    const rect = searchInput.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width - 24 && searchInput.value) {
      searchInput.value = '';
      updateUI();
    }
  });

  // AI Search button
  const aiSearchBtn = document.getElementById('aiSearchBtn');
  aiSearchBtn.addEventListener('click', async () => {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    
    try {
      aiSearchBtn.disabled = true;
      aiSearchBtn.classList.add('loading');
      await performSearch(true);
    } finally {
      aiSearchBtn.disabled = false;
      aiSearchBtn.classList.remove('loading');
    }
  });

  // Search input events
  searchInput.addEventListener('keydown', (event) => {
    // Se pressionar Enter, clica no botão de AI Search
    if (event.key === 'Enter' || event.key === 'Return') {
      event.preventDefault(); // Previne qualquer comportamento padrão
      aiSearchBtn.click(); // Simula o clique no botão
    }
  });

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

// Switch between tabs
async function switchTab(tab) {
  if (!tab) return;
  
  // Update current tab
  currentTab = tab;
  
  // Remove active class from all tabs and lists
  document.querySelectorAll('.tab-btn, .clip-list').forEach(el => {
    el.classList.remove('active');
  });
  
  // Add active class to selected tab and list
  const selectedTab = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  const selectedList = document.querySelector(`.clip-list[data-tab="${tab}"]`);
  
  if (selectedTab && selectedList) {
    selectedTab.classList.add('active');
    selectedList.classList.add('active');
    
    // Check if there's an active search
    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value.trim()) {
      // If there's a search query and we have results, use them
      if (lastSearchResults) {
        if (currentTab === 'recent') {
          updateList('recentList', lastSearchResults, favoriteClips);
        } else {
          const favoriteResults = lastSearchResults.filter(clip => 
            favoriteClips.some(f => f.text === clip.text)
          );
          updateList('favoritesList', favoriteResults, favoriteClips);
        }
        
        // Show empty state if needed
        if (lastSearchResults.length === 0) {
          showEmptyState(isSemanticSearchActive);
        }
      } else {
        // If no cached results, perform the search again
        performSearch(isSemanticSearchActive);
      }
    } else {
      // If no search, load all clips
      const { recentClips: savedRecent = [], favoriteClips: savedFavorites = [], maxClips = DEFAULT_RECENT_LIMIT, maxFavorites = 5 } = 
        await chrome.storage.local.get(['recentClips', 'favoriteClips', 'maxClips', 'maxFavorites']);
      
      // Ensure we don't exceed the limits
      recentClips = savedRecent.slice(0, maxClips);
      favoriteClips = savedFavorites.slice(0, maxFavorites);
      
      // Update only the active list
      if (tab === 'recent') {
        updateRecentList(recentClips, favoriteClips);
      } else if (tab === 'favorites') {
        updateList('favoritesList', favoriteClips, favoriteClips);
      }
    }
  }
}

// Load clips
async function loadClips() {
  try {
    const { recentClips: savedRecent = [], favoriteClips: savedFavorites = [], maxClips = DEFAULT_RECENT_LIMIT, maxFavorites = 5 } = 
      await chrome.storage.local.get(['recentClips', 'favoriteClips', 'maxClips', 'maxFavorites']);
    
    // Ensure we don't exceed the limits
    recentClips = savedRecent.slice(0, maxClips);
    favoriteClips = savedFavorites.slice(0, maxFavorites);
    
    // Update the lists
    updateRecentList(recentClips, favoriteClips);
    updateList('favoritesList', favoriteClips, favoriteClips);
  } catch (error) {
    console.error('Error loading clips:', error);
  }
}

// Update list
async function updateList(listId, clips, favoriteClips) {
  const list = document.getElementById(listId);
  if (!list) {
    console.error(`List element ${listId} not found`);
    return;
  }
  
  // Clear the current list
  list.innerHTML = '';
  
  // Check if there are clips to show
  if (!clips || clips.length === 0) {
    showEmptyState(false);
    return;
  }
  
  console.log(`Updating ${listId} with ${clips.length} clips`);
  
  // Create elements for each clip
  clips.forEach(clip => {
    const isFavorite = favoriteClips.some(f => f.text === clip.text);
    const clipElement = createClipElement(clip, isFavorite);
    list.appendChild(clipElement);
  });
}

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
      
      // Tenta colar no Chrome primeiro
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'paste', text: clip.text });
          } catch (error) {
            // Se falhar, tenta usar o script nativo para colar em qualquer lugar
            try {
              const port = chrome.runtime.connectNative('com.clipmaster.paste');
              port.onDisconnect.addListener((p) => {
                if (chrome.runtime.lastError) {
                  console.error('Failed to connect:', chrome.runtime.lastError.message);
                }
              });
              port.postMessage({ text: clip.text });
              port.disconnect();
            } catch (nativeError) {
              console.error('Native paste error:', nativeError);
            }
          }
        }
      } catch (error) {
        console.log('Tab communication error:', error);
      }
      
      // Check if we're in the pinned window before closing
      const currentWindow = await chrome.windows.getCurrent();
      const { pinnedWindowId: storedPinnedWindowId } = await chrome.storage.local.get('pinnedWindowId');
      
      // Only close if this is not the pinned window
      if (currentWindow.id !== storedPinnedWindowId) {
        setTimeout(() => window.close(), 100);
      } else {
        // Se estamos na janela pinada, apenas dê feedback visual temporário
        setTimeout(() => {
          clipElement.classList.remove('clicked');
        }, 300);
      }
    } catch (error) {
      console.error('Error:', error);
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
  decrease.addEventListener('click', () => incrementMaxClips(-1));
  increase.addEventListener('click', () => incrementMaxClips(1));
}

function incrementMaxClips(delta) {
  const input = document.getElementById('maxClips');
  const currentValue = parseInt(input.value) || 50;
  const newValue = currentValue + delta;
  
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

// Search for clips
async function performSearch(isSemanticSearch = false) {
  const searchInput = document.getElementById('searchInput');
  const query = searchInput.value.trim().toLowerCase();
  
  if (!query) {
    isSemanticSearchActive = false;
    lastSearchResults = null;
    updateUI();
    return;
  }

  try {
    const { recentClips = [], favoriteClips = [], isPro = false } = 
      await chrome.storage.local.get(['recentClips', 'favoriteClips', 'isPro']);
    let results;

    if (isSemanticSearch) {
      if (!isPro) {
        const proModal = document.getElementById('proModal');
        if (proModal) {
          proModal.style.display = 'block';
        }
        return;
      }
      
      results = await performSemanticSearch(query);
      isSemanticSearchActive = true;
    } else {
      // Ensure all clips have text property and are unique
      const uniqueClips = new Map();
      [...recentClips, ...favoriteClips].forEach(clip => {
        if (clip && typeof clip.text === 'string' && !uniqueClips.has(clip.text)) {
          uniqueClips.set(clip.text, clip);
        }
      });
      
      results = Array.from(uniqueClips.values()).filter(clip => 
        clip.text.toLowerCase().includes(query)
      );
      isSemanticSearchActive = false;
    }

    lastSearchResults = results;

    if (currentTab === 'recent') {
      updateList('recentList', results, favoriteClips);
    } else {
      const favoriteResults = results.filter(clip => 
        favoriteClips.some(f => f.text === clip.text)
      );
      updateList('favoritesList', favoriteResults, favoriteClips);
    }

    if (results.length === 0) {
      showEmptyState(isSemanticSearchActive);
    }
  } catch (error) {
    console.error('Search error:', error);
    showEmptyState(isSemanticSearchActive);
  }
}

// Perform semantic search
async function performSemanticSearch(query) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'semanticSearch',
      query: query
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Semantic search failed');
    }

    console.log('Semantic search response:', response);

    if (!response.results || !Array.isArray(response.results)) {
      console.warn('No results or invalid results format:', response);
      return [];
    }

    // Get existing clips for comparison
    const { recentClips = [], favoriteClips = [] } = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
    const existingClips = [...recentClips, ...favoriteClips];

    // Normalize and deduplicate results
    const uniqueResults = new Set(response.results.map(result => 
      typeof result === 'string' ? result : result.text
    ));

    return Array.from(uniqueResults).map(text => {
      // Check if this text already exists in any clip
      const existingClip = existingClips.find(clip => clip.text === text);
      if (existingClip) {
        return existingClip;
      }

      // Create new clip with consistent structure
      return {
        text: text,
        timestamp: new Date().toISOString()
      };
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    throw error;
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
    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value.trim()) {
      // Re-run the search to update the filtered results
      performSearch(isSemanticSearchActive);
    } else {
      // Update both lists to reflect changes
      if (currentTab === 'recent') {
        updateRecentList(recentClips, favoriteClips);
      } else {
        updateList('favoritesList', favoriteClips, favoriteClips);
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
function updateSearchState() {
  const searchInput = document.getElementById('searchInput');
  searchInput.disabled = !isPro;
  searchInput.title = isPro ? 'Search your clips' : 'Available only in Pro version';
}

function showEmptyState(isSemanticSearch = false) {
  const list = document.querySelector(`.clip-list[data-tab="${currentTab}"]`);
  if (!list) return;

  const isRecent = currentTab === 'recent';
  const title = isSemanticSearch ? 'No similar clips found' : 
                isRecent ? 'No recent clips' : 'No favorite clips';
  const description = isSemanticSearch ? 'Try a different search term' :
                     isRecent ? 'Open a new tab and copy your first text' :
                     'Star your first clip to save it here';

  list.innerHTML = `
    <div class="empty-state">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        ${isRecent ? `
          <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M7 10L12 15L17 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 15V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        ` : `
          <path d="M19 21L12 16L5 21V5C5 4.46957 5.21071 3.96086 5.58579 3.58579C5.96086 3.21071 6.46957 3 7 3H17C17.5304 3 18.0391 3.21071 18.4142 3.58579C18.7893 3.96086 19 4.46957 19 5V21Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        `}
      </svg>
      <p class="empty-state-title">${title}</p>
      <p class="empty-state-description">${description}</p>
      ${isSemanticSearch || !isRecent ? '' : '<p class="empty-state-suggestion">Click on the 🔍 or press enter/return button to use AI search</p>'}
    </div>
  `;
}

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
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.disabled = false;
    searchInput.title = 'Search your clips';
  }
  
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
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.disabled = false;
      searchInput.title = 'Search your clips';
    }
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
async function updateUI() {
  try {
    const { recentClips = [], favoriteClips = [] } = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
    
    if (currentTab === 'recent') {
      updateList('recentList', recentClips, favoriteClips);
    } else {
      updateList('favoritesList', favoriteClips, favoriteClips);
    }
    
    updateSearchState();
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
    updateRecentList(recentClips, favoriteClips);
    updateList('favoritesList', favoriteClips, favoriteClips);
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
    const searchInput = document.getElementById('searchInput');
    const aiSearchBtn = document.getElementById('aiSearchBtn');
    if (searchInput.value.trim()) {
      aiSearchBtn.click();
    }
  });

  window.addEventListener('click', (event) => {
    if (event.target === proModal) {
      proModal.style.display = 'none';
    }
  });
});
