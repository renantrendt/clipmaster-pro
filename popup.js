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

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup opened');
  initializePopup();
});

async function initializePopup() {
  try {
    // Primeiro, configurar os event listeners
    setupEventListeners();
    
    // Depois, carregar os dados
    const data = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
    console.log('Loaded data:', data);
    
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
  document.getElementById('settingsBtn')?.addEventListener('click', () => toggleModal('settingsModal', true));
  document.getElementById('proBtn')?.addEventListener('click', () => toggleModal('proModal', true));
  
  // Close buttons for modals
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) {
        toggleModal(modal.id, false);
      }
    });
  });
  
  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearch, 300));
  }
  
  // Pin Button
  document.getElementById('pinBtn').addEventListener('click', togglePin);
  
  // Export/Import
  document.getElementById('exportBtn').addEventListener('click', exportFavorites);
  document.getElementById('importBtn').addEventListener('click', importFavorites);
  
  // Max Clips Controls
  setupMaxClipsControls();
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
    console.log('Loading clips for tab:', currentTab);
    
    const data = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
    console.log('Loaded clips data:', data);
    
    const recentClips = data.recentClips || [];
    const favoriteClips = data.favoriteClips || [];
    
    // Limpar ambas as listas
    const recentList = document.getElementById('recentList');
    const favoritesList = document.getElementById('favoritesList');
    
    // Atualizar a lista ativa
    if (currentTab === 'recent') {
      console.log('Updating recent list');
      if (recentList) {
        recentList.innerHTML = '';
        if (recentClips.length === 0) {
          recentList.innerHTML = '<div class="empty-state">Nenhum clip ainda</div>';
        } else {
          recentClips.forEach(clip => {
            const isFavorite = favoriteClips.some(f => f.text === clip.text);
            const clipElement = createClipElement(clip, isFavorite);
            recentList.appendChild(clipElement);
          });
        }
      }
    } else {
      console.log('Updating favorites list');
      if (favoritesList) {
        favoritesList.innerHTML = '';
        if (favoriteClips.length === 0) {
          favoritesList.innerHTML = '<div class="empty-state">Nenhum favorito ainda</div>';
        } else {
          favoriteClips.forEach(clip => {
            const clipElement = createClipElement(clip, true);
            favoritesList.appendChild(clipElement);
          });
        }
      }
    }
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
      await navigator.clipboard.writeText(clip.text);
      
      // Add visual feedback
      clipElement.classList.add('clicked');
      setTimeout(() => {
        clipElement.classList.remove('clicked');
      }, 200);
      
      // If in recent tab, move to top
      if (currentTab === 'recent') {
        moveToTop(clip);
      }
    } catch (error) {
      console.error('Error copying text:', error);
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
  const settings = await chrome.storage.local.get(['windowSize', 'isPinned', 'maxClips']);
  if (settings.windowSize) {
    document.documentElement.style.width = settings.windowSize.width + 'px';
    document.documentElement.style.height = settings.windowSize.height + 'px';
  }
  isPinned = settings.isPinned || false;
  updatePinButton();
  
  // Set max clips value
  const maxClips = document.getElementById('maxClips');
  maxClips.value = settings.maxClips || 50;
}

// Toggle Pin
function togglePin() {
  isPinned = !isPinned;
  chrome.storage.local.set({ isPinned });
  updatePinButton();
  
  if (isPinned) {
    document.documentElement.style.position = 'fixed';
    document.documentElement.style.top = '0';
    document.documentElement.style.right = '0';
  } else {
    document.documentElement.style.position = '';
    document.documentElement.style.top = '';
    document.documentElement.style.right = '';
  }
}

function updatePinButton() {
  const pinBtn = document.getElementById('pinBtn');
  pinBtn.classList.toggle('active', isPinned);
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
  const clip = { text, timestamp: Date.now() };
  
  // Remove duplicatas
  recentClips = recentClips.filter(c => c.text !== text);
  
  // Adiciona no início
  recentClips.unshift(clip);
  
  // Aplica limite
  const limit = isPro ? PRO_LIMIT : DEFAULT_RECENT_LIMIT;
  recentClips = recentClips.slice(0, limit);
  
  await saveClips();
  updateUI();
}

async function toggleFavorite(clip) {
  try {
    const data = await chrome.storage.local.get(['favoriteClips']);
    let favoriteClips = data.favoriteClips || [];
    const isFavorite = favoriteClips.some(f => f.text === clip.text);
    
    if (isFavorite) {
      // Remove from favorites
      favoriteClips = favoriteClips.filter(f => f.text !== clip.text);
    } else {
      // Add to favorites if not already there
      if (!favoriteClips.some(f => f.text === clip.text)) {
        favoriteClips.unshift({ ...clip, timestamp: Date.now() });
      }
    }
    
    // Save updated favorites
    await chrome.storage.local.set({ favoriteClips });
    
    // Only update the UI of the current list without reloading everything
    const allClipItems = document.querySelectorAll('.clip-item');
    allClipItems.forEach(item => {
      const textElement = item.querySelector('.clip-text');
      if (textElement && textElement.textContent === clip.text) {
        const starButton = item.querySelector('.favorite-btn');
        if (starButton) {
          starButton.innerHTML = isFavorite ? '☆' : '⭐';
          starButton.classList.toggle('active', !isFavorite);
          starButton.title = isFavorite ? 'Adicionar aos favoritos' : 'Remover dos favoritos';
        }
      }
    });
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
