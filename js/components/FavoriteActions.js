class FavoriteActions extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  render() {
    const styles = `
      <style>
        @import url('../../styles.css');
      </style>
    `;

    const clip = JSON.parse(this.getAttribute('clip') || '{}');
    const isFavorite = this.getAttribute('is-favorite') === 'true';

    const button = document.createElement('button');
    button.className = `favorite-btn${isFavorite ? ' active' : ''}`;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 14 18" stroke="currentColor" fill="${isFavorite ? 'currentColor' : 'none'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 17l-6-4-6 4V3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    button.title = isFavorite ? 'Remove from favorites' : 'Add to favorites';

    this.shadowRoot.innerHTML = styles;
    this.shadowRoot.appendChild(button);
  }

  setupEventListeners() {
    const favoriteButton = this.shadowRoot.querySelector('.favorite-btn');
    
    if (favoriteButton) {
      favoriteButton.addEventListener('click', (event) => {
        event.stopPropagation();
        
        const clip = JSON.parse(this.getAttribute('clip') || '{}');
        const currentState = this.getAttribute('is-favorite') === 'true';
        
        // Dispatch custom event for favorite toggle
        const toggleEvent = new CustomEvent('toggle-favorite', {
          bubbles: true,
          composed: true,
          detail: { 
            clip: clip,
            currentState: currentState 
          }
        });
        this.dispatchEvent(toggleEvent);

        // Update visual state
        this.setAttribute('is-favorite', (!currentState).toString());
        this.render();
      });
    }
  }

  static get observedAttributes() {
    return ['clip', 'is-favorite'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if ((name === 'clip' || name === 'is-favorite') && oldValue !== newValue) {
      this.render();
    }
  }
}

// Registra o componente personalizado
customElements.define('favorite-actions', FavoriteActions);

export default FavoriteActions;
