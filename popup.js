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
    // Primeiro, configurar os event listeners
    // setupEventListeners();
    
    // Depois, carregar os dados
    const data = await chrome.storage.local.get(['recentClips', 'favoriteClips', 'isPinned', 'pinnedWindowId']);
    console.log('Loaded data:', data);
    
    // Verificar se existe uma janela pinada
    if (data.isPinned) {
      const windows = await chrome.windows.getAll();
      const pinnedWindowExists = windows.some(window => window.id === data.pinnedWindowId);
      
      // Se não existir, resetar o estado
      if (!pinnedWindowExists) {
        console.log('Pinned window not found, resetting state');
        isPinned = false;
        pinnedWindowId = null;
        chrome.storage.local.set({ isPinned: false, pinnedWindowId: null });
      } else {
        isPinned = true;
        pinnedWindowId = data.pinnedWindowId;
      }
    } else {
      isPinned = false;
      pinnedWindowId = null;
    }
    
    // Atualizar a UI
    updatePinButton();
    
    // Ativar a tab Recent
    const recentTab = document.querySelector('[data-tab="recent"]');
    const recentList = document.querySelector('.clip-list[data-tab="recent"]');
    
    if (recentTab && recentList) {
      recentTab.classList.add('active');
      recentList.classList.add('active');
    }
    
    // Carregar os clips
    await loadClips();
    
    // Carregar outras configurações
    await loadSettings();
    checkProStatus();
    
    // Verificar janela pinada
    await checkPinnedWindow();
  } catch (error) {
    console.error('Error in popup initialization:', error);
  }
}

// Listener para mensagens do background
chrome.runtime.onMessage.addListener((message) => {
  console.log('Message received in popup:', message);
  
  if (message.action === 'updateClips') {
    if (message.clips) {
      // Se recebemos os clips diretamente, usamos eles
      updateRecentList(message.clips, []);
    } else {
      // Caso contrário, recarregamos do storage
      loadClips();
    }
  }
});

async function updateRecentList(recentClips, favoriteClips) {
  console.log('Updating recent list with', recentClips?.length, 'clips');
  
  const recentList = document.getElementById('recentList');
  if (!recentList) {
    console.error('Recent list element not found');
    return;
  }
  
  // Limpar a lista
  recentList.innerHTML = '';
  
  if (!recentClips || recentClips.length === 0) {
    showEmptyState(recentList, 'empty-recent');
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
  
  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => performSearch(false), 300));
    
    // Handle click on the clear button (X)
    searchInput.addEventListener('click', (e) => {
      const rect = searchInput.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // If click is in the last 24px of the input (where X is)
      if (x > rect.width - 24 && searchInput.value) {
        searchInput.value = '';
        searchInput.focus();
        loadClips();
      }
    });
  }
  
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
  
  const aiSearchBtn = document.getElementById('aiSearchBtn');
  aiSearchBtn.addEventListener('click', async () => {
    const { isPro } = await chrome.storage.local.get(['isPro']);
    if (!isPro) {
      toggleModal('proModal', true);
      return;
    }
    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value) {
      performSearch(true);
    }
  });
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
    
    // Load clips based on current tab
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

// Carregar clips
async function loadClips() {
  try {
    const { recentClips: savedRecent = [], favoriteClips: savedFavorites = [], maxClips = DEFAULT_RECENT_LIMIT, maxFavorites = 5 } = 
      await chrome.storage.local.get(['recentClips', 'favoriteClips', 'maxClips', 'maxFavorites']);
    
    // Ensure we don't exceed the limits
    recentClips = savedRecent.slice(0, maxClips);
    favoriteClips = savedFavorites.slice(0, maxFavorites);
    
    // Update only the active list based on currentTab
    if (currentTab === 'recent') {
      updateRecentList(recentClips, favoriteClips);
    } else if (currentTab === 'favorites') {
      updateList('favoritesList', favoriteClips, favoriteClips);
    }
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
    if (listId === 'favoritesList') {
      showEmptyState(list, 'favorites');
    } else {
      showEmptyState(list, 'basic-search');
    }
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
  
  const textElement = document.createElement('p');
  textElement.className = 'clip-text';
  textElement.textContent = clip.text;
  
  const favoriteButton = document.createElement('button');
  favoriteButton.className = 'favorite-btn' + (isFavorite ? ' active' : '');
  favoriteButton.innerHTML = isFavorite ? '⭐' : '☆';
  favoriteButton.title = isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
  
  favoriteButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(clip);
  });
  
  clipElement.addEventListener('click', () => {
    navigator.clipboard.writeText(clip.text).then(() => {
      clipElement.classList.add('clicked');
      setTimeout(() => {
        clipElement.classList.remove('clicked');
      }, 200);
    });
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
  const settings = await chrome.storage.local.get(['windowSize', 'maxClips']);
  if (settings.windowSize) {
    document.documentElement.style.width = settings.windowSize.width + 'px';
    document.documentElement.style.height = settings.windowSize.height + 'px';
  }
  
  // Set max clips value
  const maxClips = document.getElementById('maxClips');
  maxClips.value = settings.maxClips || 50;
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
async function performSearch(useSemanticSearch = false) {
  const searchInput = document.getElementById('searchInput');
  const query = searchInput.value.trim().toLowerCase();
  
  if (!query) {
    await loadClips();
    return;
  }

  let filteredClips;
  const { recentClips, favoriteClips } = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
  
  // Determine which clips to search based on current tab
  const sourceClips = currentTab === 'favorites' ? (favoriteClips || []) : (recentClips || []);
  
  if (useSemanticSearch) {
    try {
      const allClips = sourceClips.map(clip => clip.text);
      
      // Show loading state
      const aiSearchBtn = document.getElementById('aiSearchBtn');
      const originalContent = aiSearchBtn.innerHTML;
      aiSearchBtn.innerHTML = `
        <svg class="loading-spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4Z" fill="currentColor" opacity="0.2"/>
          <path d="M2 12C2 6.47715 6.47715 2 12 2V4C7.58172 4 4 7.58172 4 12H2Z" fill="currentColor"/>
        </svg>
      `;
      aiSearchBtn.disabled = true;
      
      try {
        const response = await fetch('https://vsqjdfxsbgdlmihbzmcr.supabase.co/functions/v1/semantic-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcWpkZnhzYmdkbG1paGJ6bWNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzk4Mjg5NywiZXhwIjoyMDQ5NTU1ODk3fQ.NxmppFW9TXx8R5tPxUkEHUm3qEdVFpeGzyGgtF5_KUQ',
            'Origin': chrome.runtime.getURL('')
          },
          body: JSON.stringify({
            query,
            clips: allClips
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Semantic search error:', errorText);
          throw new Error('Semantic search failed: ' + errorText);
        }

        const data = await response.json();
        console.log('Semantic search response:', data);
        
        if (!data.results || !Array.isArray(data.results)) {
          console.error('Response format:', data);
          throw new Error('Invalid response format');
        }

        // Filter clips based on results
        filteredClips = sourceClips.filter((clip) => 
          data.results.includes(clip.text)
        );

        if (!filteredClips || filteredClips.length === 0) {
          const list = currentTab === 'favorites' ? 
            document.getElementById('favoritesList') : 
            document.getElementById('recentList');
          showEmptyState(list, 'semantic-search');
          return;
        }
      } finally {
        // Restore button state
        aiSearchBtn.innerHTML = originalContent;
        aiSearchBtn.disabled = false;
      }
    } catch (error) {
      console.error('Error performing semantic search:', error);
      // Show error state
      const list = currentTab === 'favorites' ? 
        document.getElementById('favoritesList') : 
        document.getElementById('recentList');
      showEmptyState(list, 'semantic-search');
      return;
    }
  } else {
    // Basic text search
    filteredClips = sourceClips.filter(clip => 
      clip.text.toLowerCase().includes(query)
    );

    if (!filteredClips || filteredClips.length === 0) {
      const list = currentTab === 'favorites' ? 
        document.getElementById('favoritesList') : 
        document.getElementById('recentList');
      showEmptyState(list, 'basic-search');
      return;
    }
  }

  // Update the appropriate list based on current tab
  if (currentTab === 'favorites') {
    updateList('favoritesList', filteredClips, favoriteClips);
  } else {
    updateRecentList(filteredClips, favoriteClips);
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
    const { isPro, maxFavorites = 5 } = await chrome.storage.local.get(['isPro', 'maxFavorites']);
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
    
    // Update only the active list
    if (currentTab === 'recent') {
      updateRecentList(recentClips, favoriteClips);
    } else if (currentTab === 'favorites') {
      updateList('favoritesList', favoriteClips, favoriteClips);
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
  const { isPro } = await chrome.storage.local.get(['isPro']);
  const proBtn = document.getElementById('proBtn');
  if (proBtn) {
    proBtn.style.color = isPro ? '#f4b400' : '#9ca3af';
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
      const data = await chrome.storage.local.get(['isPro']);
      const isPro = data.isPro || false;
      
      // Atualizar limites baseado no status Pro
      const maxClipsInput = document.getElementById('maxClips');
      const maxFavoritesInput = document.getElementById('maxFavorites');
      
      if (isPro) {
        if (maxClipsInput) {
          maxClipsInput.max = PRO_LIMIT;
          maxClipsInput.removeAttribute('disabled');
        }
        if (maxFavoritesInput) {
          maxFavoritesInput.max = PRO_LIMIT;
          maxFavoritesInput.removeAttribute('disabled');
        }
        
        // Esconder dicas Pro
        document.querySelectorAll('.pro-hint').forEach(hint => {
          hint.style.display = 'none';
        });
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
    });
  }
}

// Initialize settings
async function initializeSettings() {
  const data = await chrome.storage.local.get(['maxClips', 'maxFavorites', 'isPro']);
  const isPro = data.isPro || false;
  const maxLimit = isPro ? PRO_LIMIT : DEFAULT_RECENT_LIMIT;
  const maxFavLimit = isPro ? PRO_LIMIT : DEFAULT_FAVORITES_LIMIT;
  
  const maxClipsInput = document.getElementById('maxClips');
  if (maxClipsInput) {
    maxClipsInput.value = data.maxClips || DEFAULT_RECENT_LIMIT;
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

function toggleLoading(show) {
  const loadingState = document.querySelector('.loading-state');
  const clipLists = document.querySelectorAll('.clip-list');
  
  if (show) {
    loadingState.classList.add('active');
    clipLists.forEach(list => list.style.display = 'none');
  } else {
    loadingState.classList.remove('active');
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    document.querySelector(`.clip-list[data-tab="${activeTab}"]`).style.display = 'block';
  }
}

async function semanticSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

  toggleLoading(true);
  
  try {
    // ... código existente da busca semântica ...
  } catch (error) {
    console.error('Error during semantic search:', error);
    showEmptyState(recentList, 'semantic-search');
  } finally {
    toggleLoading(false);
  }
}

document.querySelector('.ai-search-btn').addEventListener('click', () => {
  if (!searchInput.value.trim()) return;
  semanticSearch();
});

function showEmptyState(list, type) {
  let title, description;
  let icon = '';
  
  if (type === 'basic-search') {
    title = 'Any clip found';
    description = 'Try AI search';
    icon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  } else if (type === 'semantic-search') {
    title = 'No similar clips found';
    description = 'Try a different search term or check your recent clips';
    icon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  } else if (type === 'favorites') {
    title = 'Any favorite clip';
    description = 'Star your first clip to save it here';
    icon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 21L12 16L5 21V5C5 4.46957 5.21071 3.96086 5.58579 3.58579C5.96086 3.21071 6.46957 3 7 3H17C17.5304 3 18.0391 3.21071 18.4142 3.58579C18.7893 3.96086 19 4.46957 19 5V21Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  } else if (type === 'empty-recent') {
    title = 'Any recent clip';
    description = 'Open a new tab and copy your first text';
    icon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 10L12 15L17 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12 15V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  if (title && description) {
    list.innerHTML = `
      <div class="empty-state">
        ${icon}
        <p class="empty-title">${title}</p>
        <p class="empty-description">${description}</p>
      </div>
    `;
  }
}
