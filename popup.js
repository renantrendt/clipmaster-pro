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

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup opened');
  try {
    await initializePopup();
    setupEventListeners();
    setupSettingsModal();
    await initializeSettings();
    await checkProStatus();
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
  console.log('Updating recent list with', recentClips.length, 'clips');
  
  const recentList = document.getElementById('recentList');
  if (!recentList) {
    console.error('Recent list element not found');
    return;
  }
  
  // Limpar a lista
  recentList.innerHTML = '';
  
  if (recentClips.length === 0) {
    recentList.innerHTML = '<div class="empty-state">Nenhum clip ainda</div>';
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
    proBtn.addEventListener('click', () => toggleModal('proModal', true));
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
    searchInput.addEventListener('input', debounce(handleSearch, 300));
  }
  
  // Pin Button
  const pinBtn = document.getElementById('pinBtn');
  if (pinBtn) {
    pinBtn.addEventListener('click', togglePin);
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
function switchTab(tab) {
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
    loadClips(); // Reload clips when switching tabs
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
function updateList(listId, clips, favoriteClips) {
  const list = document.getElementById(listId);
  if (!list) {
    console.error(`List element ${listId} not found`);
    return;
  }
  
  // Limpar a lista atual
  list.innerHTML = '';
  
  // Verificar se há clips para mostrar
  if (!clips || clips.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum clip ainda</div>';
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
function createClipElement(clip, isFavorite) {
  const clipElement = document.createElement('div');
  clipElement.className = 'clip-item';
  
  const textElement = document.createElement('div');
  textElement.className = 'clip-text';
  textElement.textContent = clip.text;
  
  const favoriteButton = document.createElement('button');
  favoriteButton.className = 'action-btn favorite-btn' + (isFavorite ? ' active' : '');
  favoriteButton.innerHTML = isFavorite ? '⭐' : '☆';
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
      
      // Add visual feedback
      clipElement.classList.add('clicked');
      
      // If in recent tab, move to top
      if (currentTab === 'recent') {
        moveToTop(clip);
      }
      
      // Send message to content script to paste the text
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        try {
          await chrome.tabs.sendMessage(tabs[0].id, {
            action: 'pasteText',
            text: clip.text
          });
        } catch (error) {
          console.error('Error sending message to content script:', error);
        }
      }
      
      // Close popup if not pinned (with a small delay to ensure message is sent)
      if (!isPinned) {
        setTimeout(() => {
          window.close();
        }, 100);
      } else {
        setTimeout(() => {
          clipElement.classList.remove('clicked');
        }, 200);
      }
    } catch (error) {
      console.error('Error handling clip click:', error);
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
function handleSearch(e) {
  const searchTerm = e.target.value.toLowerCase();
  const lists = currentTab === 'recent' ? ['recentList'] : ['favoritesList'];
  
  lists.forEach(async listId => {
    const storageKey = listId === 'recentList' ? 'recentClips' : 'favoriteClips';
    const data = await chrome.storage.local.get([storageKey]);
    const clips = data[storageKey] || [];
    
    const filteredClips = clips.filter(clip => 
      clip.text.toLowerCase().includes(searchTerm)
    );
    
    updateList(listId, filteredClips, data.favoriteClips || []);
  });
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
    
    // Update both lists to reflect changes
    updateRecentList(recentClips, favoriteClips);
    updateList('favoritesList', favoriteClips, favoriteClips);
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

// Funcionalidades Pro
async function handleSearch(e) {
  if (!isPro) return;
  
  const query = e.target.value.toLowerCase();
  if (!query) {
    updateUI();
    return;
  }

  const filteredRecent = recentClips.filter(clip => 
    clip.text.toLowerCase().includes(query)
  );
  const filteredFavorites = favoriteClips.filter(clip =>
    clip.text.toLowerCase().includes(query)
  );

  updateList('recentList', filteredRecent, favoriteClips);
  updateList('favoritesList', filteredFavorites, favoriteClips);
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
  try {
    const response = await fetch('http://localhost:3000/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const session = await response.json();
    
    // Redirecionar para o Checkout do Stripe
    const stripe = Stripe('sua_chave_publica_stripe');
    const result = await stripe.redirectToCheckout({
      sessionId: session.id
    });
    
    if (result.error) {
      alert('Erro ao iniciar checkout: ' + result.error.message);
    }
  } catch (error) {
    alert('Erro ao processar pagamento: ' + error.message);
  }
}

// Verificar status Pro
async function checkProStatus() {
  try {
    const userId = await chrome.storage.local.get(['userId']);
    if (!userId) {
      // Gerar ID único para o usuário se não existir
      const newUserId = 'user_' + Date.now();
      await chrome.storage.local.set({ userId: newUserId });
    }
    
    const response = await fetch(`http://localhost:3000/check-pro-status/${userId.userId}`);
    const data = await response.json();
    
    isPro = data.isPro;
    await chrome.storage.local.set({ isPro });
    updateUI();
  } catch (error) {
    console.error('Erro ao verificar status Pro:', error);
  }
}

// Show Pro upgrade modal
function showProUpgradeModal() {
  const modal = document.getElementById('proModal');
  const content = modal.querySelector('.pro-features');
  
  content.innerHTML = `
    <h3>Upgrade to Pro!</h3>
    <p>You've reached the free plan limit. Upgrade to Pro to enjoy:</p>
    <ul>
      <li>✨ Unlimited recent clips</li>
      <li>⭐ Unlimited favorites</li>
      <li>🔍 AI-powered semantic search</li>
      <li>🚀 Premium support</li>
    </ul>
    <button id="upgradeBtn" class="primary-btn">Upgrade Now - Only $4.99/month</button>
  `;
  
  const upgradeBtn = content.querySelector('#upgradeBtn');
  upgradeBtn.addEventListener('click', () => {
    window.open('http://localhost:3000/checkout', '_blank');
  });
  
  toggleModal('proModal', true);
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

// Settings Modal
function setupSettingsModal() {
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeBtn = settingsModal?.querySelector('.close-btn');
  const saveBtn = document.getElementById('saveSettingsBtn');
  const maxClipsInput = document.getElementById('maxClips');
  const maxFavoritesInput = document.getElementById('maxFavorites');
  const proHint = document.querySelector('.pro-hint');

  // Only proceed if we have all required elements
  if (!settingsBtn || !settingsModal || !closeBtn || !saveBtn || !maxClipsInput || !maxFavoritesInput) {
    console.error('Settings elements not found');
    return;
  }

  // Open settings modal
  settingsBtn.addEventListener('click', async () => {
    try {
      const { isPro, maxClips = DEFAULT_RECENT_LIMIT, maxFavorites = 5 } = 
        await chrome.storage.local.get(['isPro', 'maxClips', 'maxFavorites']);
      
      maxClipsInput.max = isPro ? '1000' : '50';
      maxClipsInput.value = maxClips;
      
      maxFavoritesInput.max = isPro ? '1000' : '5';
      maxFavoritesInput.value = maxFavorites;
      
      settingsModal.style.display = 'block';
      maxClipsInput.focus();
    } catch (error) {
      console.error('Error opening settings:', error);
    }
  });

  // Pro hint click
  if (proHint) {
    proHint.addEventListener('click', () => {
      settingsModal.style.display = 'none';
      const proModal = document.getElementById('proModal');
      if (proModal) proModal.style.display = 'block';
    });
  }

  // Close settings modal
  closeBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  function updateMaxClipsValue(change) {
    const currentValue = parseInt(maxClipsInput.value) || DEFAULT_RECENT_LIMIT;
    const min = parseInt(maxClipsInput.min) || 10;
    const max = parseInt(maxClipsInput.max) || 50;
    const newValue = currentValue + change;
    
    if (newValue >= min && newValue <= max) {
      maxClipsInput.value = newValue;
    }
  }

  // Keyboard controls for max clips
  maxClipsInput.addEventListener('keydown', (event) => {
    switch(event.key) {
      case 'ArrowUp':
        event.preventDefault();
        updateMaxClipsValue(10);
        break;
      case 'ArrowDown':
        event.preventDefault();
        updateMaxClipsValue(-10);
        break;
      case 'Enter':
        event.preventDefault();
        saveBtn.click();
        break;
      case 'Escape':
        event.preventDefault();
        settingsModal.style.display = 'none';
        break;
    }
  });

  function updateMaxFavoritesValue(change) {
    const currentValue = parseInt(maxFavoritesInput.value) || 5;
    const min = parseInt(maxFavoritesInput.min) || 1;
    const max = parseInt(maxFavoritesInput.max) || 5;
    const newValue = currentValue + change;
    
    if (newValue >= min && newValue <= max) {
      maxFavoritesInput.value = newValue;
    }
  }

  // Keyboard controls for max favorites
  maxFavoritesInput.addEventListener('keydown', (event) => {
    switch(event.key) {
      case 'ArrowUp':
        event.preventDefault();
        updateMaxFavoritesValue(1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        updateMaxFavoritesValue(-1);
        break;
      case 'Enter':
        event.preventDefault();
        saveBtn.click();
        break;
      case 'Escape':
        event.preventDefault();
        settingsModal.style.display = 'none';
        break;
    }
  });

  // Save settings
  saveBtn.addEventListener('click', async () => {
    try {
      const maxClips = parseInt(maxClipsInput.value) || DEFAULT_RECENT_LIMIT;
      const maxFavorites = parseInt(maxFavoritesInput.value) || 5;
      const { isPro } = await chrome.storage.local.get(['isPro']);
      
      // Validate limits for free users
      if (!isPro) {
        if (maxClips > 50) {
          maxClipsInput.value = 50;
          const proModal = document.getElementById('proModal');
          if (proModal) proModal.style.display = 'block';
          return;
        }
        if (maxFavorites > 5) {
          maxFavoritesInput.value = 5;
          const proModal = document.getElementById('proModal');
          if (proModal) proModal.style.display = 'block';
          return;
        }
      }
      
      // Save the new settings
      await chrome.storage.local.set({ maxClips, maxFavorites });
      
      // Trim both lists if needed
      recentClips = recentClips.slice(0, maxClips);
      favoriteClips = favoriteClips.slice(0, maxFavorites);
      
      // Save and update UI
      await saveClips();
      updateRecentList(recentClips, favoriteClips);
      updateList('favoritesList', favoriteClips, favoriteClips);
      
      settingsModal.style.display = 'none';
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  });
}

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializePopup();
    setupEventListeners();
    setupSettingsModal(); // Make sure this is called
    await initializeSettings();
    await checkProStatus();
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
});
