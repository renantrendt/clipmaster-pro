import ClipItem from './ClipItem.js';

class ClipList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.clips = [];
    this.type = 'recent';
  }

  static get observedAttributes() {
    return ['clips', 'type'];
  }

  connectedCallback() {
    this.type = this.getAttribute('type') || 'recent';
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'clips') {
      try {
        // Tenta parsear clips com segurança
        this.clips = newValue ? JSON.parse(newValue) : [];
        this.render();
      } catch (error) {
        console.error('Error parsing clips:', error);
        this.clips = [];
        this.render();
      }
    }

    if (name === 'type') {
      this.type = newValue || 'recent';
      this.render();
    }
  }

  render() {
    const styles = `
      <style>
        @import url('../../styles.css');
      </style>
    `;

    // Verifica se é a aba atual
    const tabsComponent = document.querySelector('app-tabs');
    const currentTab = tabsComponent ? tabsComponent.getAttribute('current-tab') : 'recent';
    const isCurrentTab = currentTab === this.type;

    // Atualiza visibilidade
    this.classList.toggle('hidden', !isCurrentTab);

    // Se não for a aba atual, não renderiza nada
    if (!isCurrentTab) {
      this.shadowRoot.innerHTML = styles;
      return;
    }

    const isEmptyList = !this.clips || this.clips.length === 0;

    let clipListHTML;
    if (isEmptyList) {
      const emptyStateIcon = this.type === 'recent' 
        ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
             <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
             <path d="M7 10L12 15L17 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
             <path d="M12 15V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`
        : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
             <path d="M19 21L12 16L5 21V5C5 4.46957 5.21071 3.96086 5.58579 3.58579C5.96086 3.21071 6.46957 3 7 3H17C17.5304 3 18.0391 3.21071 18.4142 3.58579C18.7893 3.96086 19 4.46957 19 5V21Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`;

      clipListHTML = `
        <div class="empty-state">
          ${emptyStateIcon}
          <p class="empty-state-description">
            ${this.type === 'recent' 
              ? 'No recent clips. Copy something to get started!' 
              : 'No favorite clips. Star a clip to save it here'}
          </p>
        </div>
      `;
    } else {
      clipListHTML = `
        <div class="clip-list${isCurrentTab ? ' active' : ''}">
          ${this.clips.map((clip, index) => `
            <clip-item 
              clip='${JSON.stringify(clip)}' 
              type="${this.type}" 
              index="${index}">
            </clip-item>
          `).join('')}
        </div>
      `;
    }

    this.shadowRoot.innerHTML = styles + clipListHTML;
  }

  setupEventListeners() {
    // Add event listeners for clip interactions
    this.shadowRoot.addEventListener('clip-copied', (event) => {
      // Dispatch event to parent for handling
      this.dispatchEvent(new CustomEvent('clip-copied', { 
        detail: event.detail,
        bubbles: true 
      }));
    });

    this.shadowRoot.addEventListener('toggle-favorite', (event) => {
      // Dispatch event to parent for handling
      this.dispatchEvent(new CustomEvent('toggle-favorite', { 
        detail: event.detail,
        bubbles: true 
      }));
    });
  }
}

export default ClipList;
