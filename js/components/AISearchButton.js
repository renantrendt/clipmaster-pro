export class AISearchButton {
  constructor(options = {}) {
    this.onAISearch = options.onAISearch || (() => {});
    this.isPro = options.isPro || false;
    this.element = this.createButton();
    this.setupEventListeners();
  }

  createButton() {
    const button = document.createElement('button');
    button.className = 'ai-search-btn';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z" stroke="currentColor" stroke-width="1.5"/>
        <path d="M12 8V16M8 12H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      AI Search
    `;
    button.title = this.isPro ? 'AI Search' : 'Upgrade to Pro for AI Search';
    return button;
  }

  setupEventListeners() {
    this.element.addEventListener('click', () => {
      if (this.isPro) {
        this.onAISearch();
      } else {
        // Dispatch event to show pro modal
        document.dispatchEvent(new CustomEvent('showProUpgradeModal'));
      }
    });
  }

  mount(container) {
    container.appendChild(this.element);
  }

  updateProStatus(isPro) {
    this.isPro = isPro;
    this.element.title = this.isPro ? 'AI Search' : 'Upgrade to Pro for AI Search';
    this.element.classList.toggle('pro-only', !this.isPro);
  }
}
