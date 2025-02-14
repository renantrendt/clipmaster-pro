// Utility function
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

export class SearchBar {
  constructor(options = {}) {
    this.container = null;
    this.searchInput = null;
    this.aiSearchBtn = null;
    this.onSearch = options.onSearch || (() => {});
    this.onAISearch = options.onAISearch || (() => {});
    this.onClear = options.onClear || (() => {});
    this.onLoadMore = options.onLoadMore || (() => {});
    this.onUpdateUI = options.onUpdateUI || (() => {});
    this.onShowEmpty = options.onShowEmpty || (() => {});
    this.onShowProModal = options.onShowProModal || (() => {});
    this.getCurrentTab = options.getCurrentTab || (() => 'recent');
    this.isPro = options.isPro || false;

    // Search state
    this.isSemanticSearchActive = false;
    this.lastSearchResults = null;
    this.TOKEN_LIMIT = 4000;
    this.processedRecentClips = new Set();
    this.processedFavoriteClips = new Set();
    this.remainingRecentClips = [];
  }

  init(containerElement) {
    this.container = containerElement;
    this.render();
    this.setupEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="search-container">
        <input type="text" id="searchInput" placeholder="Search clips...">
      </div>
      <button id="aiSearchBtn" class="ai-search-btn" title="AI Search">
        <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </button>
    `;

    this.searchInput = this.container.querySelector('#searchInput');
    this.aiSearchBtn = this.container.querySelector('#aiSearchBtn');
  }

  setupEventListeners() {
    // Search input with debounce
    const debouncedSearch = debounce(() => this.onSearch(false), 300);
    this.searchInput.addEventListener('input', debouncedSearch);

    // Enter key handler
    this.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Return') {
        event.preventDefault();
        this.aiSearchBtn.click();
      }
    });

    // Handle cursor style for the X button
    this.searchInput.addEventListener('mousemove', (e) => {
      const rect = this.searchInput.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > rect.width - 24 && this.searchInput.value) {
        this.searchInput.style.cursor = 'pointer';
      } else {
        this.searchInput.style.cursor = 'text';
      }
    });

    this.searchInput.addEventListener('mouseleave', () => {
      this.searchInput.style.cursor = 'text';
    });

    // Handle click on the X button
    this.searchInput.addEventListener('click', (e) => {
      const rect = this.searchInput.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > rect.width - 24 && this.searchInput.value && this.searchInput.style.cursor === 'pointer') {
        this.searchInput.value = '';
        this.removeSearchMoreButton();
        this.onClear();
      }
    });

    // AI Search button
    this.aiSearchBtn.addEventListener('click', async () => {
      const query = this.searchInput.value.trim();
      if (!query) return;

      try {
        this.aiSearchBtn.disabled = true;
        this.aiSearchBtn.classList.add('loading');
        await this.onAISearch(true);
      } finally {
        this.aiSearchBtn.disabled = false;
        this.aiSearchBtn.classList.remove('loading');
      }
    });
  }

  getValue() {
    return this.searchInput.value.trim();
  }

  setValue(value) {
    this.searchInput.value = value;
  }

  removeSearchMoreButton() {
    const searchMoreBtn = document.getElementById('searchMoreBtn');
    if (searchMoreBtn) {
      searchMoreBtn.remove();
    }
  }

  addSearchMoreButton(parentElementId) {
    this.removeSearchMoreButton(); // Remove any existing button first
    const searchMoreBtn = document.createElement('button');
    searchMoreBtn.id = 'searchMoreBtn';
    searchMoreBtn.className = 'search-more-btn';
    searchMoreBtn.textContent = 'Pesquisar mais resultados';
    searchMoreBtn.addEventListener('click', () => this.onLoadMore());
    document.getElementById(parentElementId).parentNode.appendChild(searchMoreBtn);
  }

  clear() {
    this.setValue('');
    this.onClear();
  }

  async performSearch(isSemanticSearch = false, isAutoLoading = false) {
    const query = this.getValue();
    
    if (!query) {
      this.isSemanticSearchActive = false;
      this.lastSearchResults = null;
      this.onUpdateUI();
      this.removeSearchMoreButton();
      return;
    }

    try {
      const { recentClips = [], favoriteClips = [], isPro = false } = 
        await chrome.storage.local.get(['recentClips', 'favoriteClips', 'isPro']);
      let results;

      if (isSemanticSearch) {
        if (!isPro) {
          this.onShowProModal();
          return;
        }
        
        results = await this.performSemanticSearch(query, isAutoLoading);
        this.isSemanticSearchActive = true;
        
        // Manage search more button
        const hasMore = this.getCurrentTab() === 'recent' ? 
          this.remainingRecentClips.length > 0 : 
          this.remainingFavoriteClips.length > 0;
        
        if (results.length > 0 && hasMore) {
          this.addSearchMoreButton(this.getCurrentTab() === 'recent' ? 'recentList' : 'favoritesList');
        } else {
          this.removeSearchMoreButton();
        }
      } else {
        // Ensure all clips have text property and are unique
        const uniqueClips = new Map();
        [...recentClips, ...favoriteClips].forEach(clip => {
          if (clip && typeof clip.text === 'string' && !uniqueClips.has(clip.text)) {
            uniqueClips.set(clip.text, clip);
          }
        });
        
        results = Array.from(uniqueClips.values()).filter(clip => 
          clip.text.toLowerCase().includes(query.toLowerCase())
        );
        this.isSemanticSearchActive = false;
      }

      this.lastSearchResults = results;

      if (results.length === 0) {
        this.onShowEmpty(isSemanticSearch);
      } else {
        const currentTab = this.getCurrentTab();
        if (currentTab === 'recent') {
          this.onUpdateUI(results, results.filter(clip => 
            clip.isFavorite
          ));
        } else {
          this.onUpdateUI(results, results);
        }
      }
    } catch (error) {
      console.error('Error performing search:', error);
    }
  }

  async performSemanticSearch(query, isAutoLoading = false) {
    try {
      const { recentClips = [], favoriteClips = [] } = 
        await chrome.storage.local.get(['recentClips', 'favoriteClips']);
      
      const currentTab = this.getCurrentTab();
      const clips = currentTab === 'recent' ? recentClips : favoriteClips;
      const processedClips = currentTab === 'recent' ? 
        this.processedRecentClips : this.processedFavoriteClips;
      
      if (!isAutoLoading) {
        processedClips.clear();
        if (currentTab === 'recent') {
          this.remainingRecentClips = [...clips];
        } else {
          this.remainingFavoriteClips = [...clips];
        }
      }
      
      // Get next chunk of unprocessed clips
      const chunk = this.getNextChunk(
        currentTab === 'recent' ? this.remainingRecentClips : this.remainingFavoriteClips,
        this.TOKEN_LIMIT
      );
      
      if (!chunk.length) {
        return [];
      }
      
      // Add processed clips to set
      chunk.forEach(clip => processedClips.add(clip.text));
      
      // Send request to background script for semantic search
      const response = await chrome.runtime.sendMessage({
        action: 'semanticSearch',
        query,
        clips: chunk
      });
      
      if (!response || !response.results) {
        throw new Error('Invalid response from semantic search');
      }
      
      return response.results;
    } catch (error) {
      console.error('Error in semantic search:', error);
      return [];
    }
  }

  getNextChunk(clips, tokenLimit) {
    const chunk = [];
    let totalTokens = 0;
    
    while (clips.length > 0 && totalTokens < tokenLimit) {
      const clip = clips[0];
      const tokens = this.estimateTokenCount(clip.text);
      
      if (tokens > tokenLimit) {
        clips.shift(); // Skip this clip if it's too large
        continue;
      }
      
      if (totalTokens + tokens <= tokenLimit) {
        chunk.push(clips.shift());
        totalTokens += tokens;
      } else {
        break;
      }
    }
    
    return chunk;
  }

  estimateTokenCount(text) {
    return Math.ceil(text.length / 4); // Rough estimate: 4 characters per token
  }

  updateSearchState() {
    if (this.searchInput) {
      this.searchInput.disabled = false;
      this.searchInput.title = 'Search your clips';
    }
  }

  showEmptyState(isSemanticSearch = false) {
    const query = this.getValue();
    const isSearch = query.length > 0;
    
    const title = isSemanticSearch ? 'No similar clips found' : 
                  isSearch ? 'No clips found' :
                  'No clips yet';
    
    const description = isSemanticSearch ? 'Try a different search term' :
                       isSearch ? 'Try a different search term' :
                       'Copy something to get started';
    
    const container = document.createElement('div');
    container.className = 'empty-state';
    container.innerHTML = `
      <div class="empty-state-icon">${isSearch ? '🔍' : '📋'}</div>
      <h3 class="empty-state-title">${title}</h3>
      <p class="empty-state-description">${description}</p>
      ${isSearch && !isSemanticSearch ? '<p class="empty-state-suggestion">Click on the 🔍 or press Enter to use AI search</p>' : ''}
    `;
    
    const listId = this.getCurrentTab() === 'recent' ? 'recentList' : 'favoritesList';
    const list = document.getElementById(listId);
    if (list) {
      list.innerHTML = '';
      list.appendChild(container);
    }
  }

  focus() {
    this.searchInput.focus();
  }

  disable() {
    this.searchInput.disabled = true;
    this.aiSearchBtn.disabled = true;
  }

  enable() {
    this.searchInput.disabled = false;
    this.aiSearchBtn.disabled = false;
  }

  triggerAISearch() {
    if (this.getValue() && !this.aiSearchBtn.disabled) {
      this.aiSearchBtn.click();
    }
  }

  handleSearchMoreButton(listId) {
    const hasResults = this.lastSearchResults && this.lastSearchResults.length > 0;
    const remainingClips = this.getCurrentTab() === 'recent' ? 
      this.remainingRecentClips : 
      this.remainingFavoriteClips;
    
    if (hasResults && remainingClips.length > 0) {
      this.addSearchMoreButton(listId);
    } else {
      this.removeSearchMoreButton();
    }
  }
}
