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
      <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
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
