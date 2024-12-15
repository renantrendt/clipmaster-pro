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

// Inicialização
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

// Listener para mensagens do background
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
  
  // Limpar a lista
  recentList.innerHTML = '';
  
  if (recentClips.length === 0) {
    showEmptyState(false);
    return;
  }
  
  // Adicionar cada clip
  recentClips.forEach(clip => {
    const isFavorite = favoriteClips.some(f => f.text === clip.text);
    const clipElement = createClipElement(clip, isFavorite);
    recentList.appendChild(clipElement);
  });
}

// Configuração dos event listeners
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

// Alternar entre abas
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

// Carregar clips
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

// Atualizar lista
async function updateList(listId, clips, favoriteClips) {
  const list = document.getElementById(listId);
  if (!list) {
    console.error(`List element ${listId} not found`);
    return;
  }
  
  // Limpar a lista atual
  list.innerHTML = '';
  
  // Verificar se há clips para mostrar
  if (!clips || clips.length === 0) {
    showEmptyState(false);
    return;
  }
  
  console.log(`Updating ${listId} with ${clips.length} clips`);
  
  // Criar elementos para cada clip
  clips.forEach(clip => {
    const isFavorite = favoriteClips.some(f => f.text === clip.text);
    const clipElement = createClipElement(clip, isFavorite);
    list.appendChild(clipElement);
  });
}

// Criar item de clip
function createClipElement(clip, isFavorite = false) {
  const clipElement = document.createElement('div');
  clipElement.className = 'clip-item';
  
  const textElement = document.createElement('div');
  textElement.className = 'clip-text';
  textElement.textContent = clip.text;
  
  const favoriteButton = document.createElement('button');
  favoriteButton.className = 'action-btn favorite-btn' + (isFavorite ? ' active' : '');
  favoriteButton.innerHTML = `<svg width="10" height="14" viewBox="0 0 14 18" stroke="currentColor" fill="${isFavorite ? 'currentColor' : 'none'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l-6-4-6 4V3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"></path></svg>`;
  favoriteButton.title = isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
  
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
      
      // Get active tab and send paste message
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'paste', text: clip.text });
      }
      
      // Close popup after a short delay
      setTimeout(() => window.close(), 100);
    } catch (error) {
      console.error('Error:', error);
      clipElement.classList.remove('clicked');
    }
  });
  
  clipElement.appendChild(textElement);
  clipElement.appendChild(favoriteButton);
  
  return clipElement;
}

// Configurar controles de max clips
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

// Carregar configurações
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

// Listener para quando uma janela é fechada
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === pinnedWindowId) {
    console.log('Pinned window was closed');
    // Resetar o estado
    isPinned = false;
    pinnedWindowId = null;
    // Salvar o novo estado
    chrome.storage.local.set({ 
      isPinned: false,
      pinnedWindowId: null 
    }, () => {
      console.log('Pin state reset after window close');
    });
  }
});

// Verificar se já existe uma janela pinada ao iniciar
async function checkPinnedWindow() {
  try {
    if (!isPinned) return;
    
    const windows = await chrome.windows.getAll();
    const currentWindow = await chrome.windows.getCurrent();
    
    // Se esta é uma janela popup e isPinned é true, atualizar pinnedWindowId
    if (currentWindow.type === 'popup') {
      // Verificar se a janela pinada ainda existe
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

// Buscar clips
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

// Salvar configurações
async function saveSettings() {
  const maxClips = document.getElementById('maxClips').value;
  await chrome.storage.local.set({ maxClips: parseInt(maxClips) });
  toggleModal('settingsModal', false);
}

// Gerenciamento de clips
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
  searchInput.title = isPro ? 'Buscar em seus clips' : 'Disponível apenas na versão Pro';
}

function showEmptyState(isSemanticSearch) {
  const list = document.querySelector(`.clip-list[data-tab="${currentTab}"]`);
  if (!list) return;

  const title = isSemanticSearch ? 'No similar clips found' : 'No clips found';
  const description = isSemanticSearch 
    ? 'Try a different search term or check your recent clips'
    : 'Try a different search term';

  list.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-description">${description}</div>
      ${isSemanticSearch ? '' : '<div class="empty-state-suggestion">Click on the 🔍 button to use AI search</div>'}
    </div>
  `;
}

// Import/Export
function exportFavorites() {
  const data = JSON.stringify(favoriteClips);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clipmaster-favorites.json';
  a.click();
  
  URL.revokeObjectURL(url);
}

function importFavorites() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        favoriteClips = imported;
        await saveClips();
        updateUI();
      } catch (err) {
        alert('Erro ao importar favoritos. Verifique se o arquivo é válido.');
      }
    };
    
    reader.readAsText(file);
  };
  
  input.click();
}

// Settings
function showSettings() {
  const modal = document.getElementById('settingsModal');
  modal.style.display = 'block';
  
  const recentLimit = document.getElementById('recentLimit');
  const favoritesLimit = document.getElementById('favoritesLimit');
  
  recentLimit.value = isPro ? PRO_LIMIT : DEFAULT_RECENT_LIMIT;
  favoritesLimit.value = isPro ? PRO_LIMIT : DEFAULT_FAVORITES_LIMIT;
  
  if (!isPro) {
    recentLimit.max = DEFAULT_RECENT_LIMIT;
    favoritesLimit.max = DEFAULT_FAVORITES_LIMIT;
  }
}

// Stripe Integration
async function startCheckout() {
  // Ativar features Pro localmente
  isPro = true;
  await chrome.storage.local.set({ isPro: true });
  
  // Atualizar limites
  const settings = {
    maxClips: PRO_LIMIT,
    maxFavorites: PRO_LIMIT
  };
  await chrome.storage.local.set(settings);
  
  // Atualizar UI
  document.getElementById('proModal').style.display = 'none';
  await updateProButton();
  
  // Remover hints Pro
  document.querySelectorAll('.pro-hint').forEach(hint => {
    hint.style.display = 'none';
  });
  
  // Habilitar busca
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.disabled = false;
    searchInput.title = 'Buscar em seus clips';
  }
  
  // Atualizar UI
  await loadSettings();
  updateUI();
}

// Verificar status Pro
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
      searchInput.title = 'Buscar em seus clips';
    }
  }
  
  return isPro;
}

// Show Pro upgrade modal
function showProUpgradeModal() {
  const proModal = document.getElementById('proModal');
  if (proModal) {
    proModal.style.display = 'block';
    
    // Configurar o botão de upgrade
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
    proBtn.title = isPro ? 'Pro Version' : 'Upgrade para Pro';
    proBtn.className = isPro ? 'pro-btn is-pro' : 'pro-btn';
  }
}

function updatePinButton() {
  const pinBtn = document.getElementById('pinBtn');
  if (pinBtn) {
    pinBtn.classList.toggle('active', isPinned);
    pinBtn.title = isPinned ? 'Desafixar janela' : 'Fixar janela';
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
      
      // Atualizar limites baseado no status Pro
      const maxClipsInput = document.getElementById('maxClips');
      const maxFavoritesInput = document.getElementById('maxFavorites');
      
      if (isPro) {
        if (maxClipsInput) {
          maxClipsInput.removeAttribute('max');
          maxClipsInput.removeAttribute('disabled');
          // Se o valor atual for o padrão ou menor que o limite não-Pro, define 1000
          if (!data.maxClips || data.maxClips <= 50) {
            maxClipsInput.value = '1000';
          }
        }
        if (maxFavoritesInput) {
          maxFavoritesInput.removeAttribute('max');
          maxFavoritesInput.removeAttribute('disabled');
          // Se o valor atual for o padrão ou menor que o limite não-Pro, define 1000
          if (!data.maxFavorites || data.maxFavorites <= 5) {
            maxFavoritesInput.value = '1000';
          }
        }
        
        // Esconder dicas Pro
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
      
      // Atualizar a UI
      await loadClips();
      await loadFavorites();
    });
  }

  // Fechar modal ao clicar fora
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
  
  // Esconder as dicas Pro se o usuário for Pro
  if (isPro) {
    document.querySelectorAll('.pro-hint').forEach(hint => {
      hint.style.display = 'none';
    });
  }
}

// Setup pro hints click handlers
function setupProHints() {
  const proHints = document.querySelectorAll('.pro-hint');
  const proModal = document.getElementById('proModal');
  const upgradeBtn = document.getElementById('upgradeBtn');

  // Event listener para o botão de upgrade
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

  // Event listener para o botão de fechar
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
    
    // Se tiver texto no campo de busca, fazer a busca semântica automaticamente
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
