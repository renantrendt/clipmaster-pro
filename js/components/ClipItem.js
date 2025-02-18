import FavoriteActions from './FavoriteActions.js';

class ClipItem extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.clip = null;
    this.index = -1;
    this.type = this.getAttribute('type') || 'recent'; // 'recent' or 'favorite'
  }

  connectedCallback() {
    try {
      const clipAttr = this.getAttribute('clip');
      console.log('Raw clip attribute:', clipAttr);
      
      // Parsing strategy
      let parsedClip = null;
      try {
        parsedClip = clipAttr ? JSON.parse(clipAttr) : null;
      } catch (error) {
        console.error('Error parsing clip:', error);
      }
      
      if (!parsedClip) {
        parsedClip = {
          text: clipAttr || 'Invalid Clip',
          timestamp: Date.now(),
          id: crypto.randomUUID(),
          type: 'recent'
        };
      }
      
      this.clip = parsedClip;
      this.index = parseInt(this.getAttribute('index') || '-1');
      this.type = this.getAttribute('type') || 'recent';
      
      this.render();
      this.setupEventListeners();
    } catch (error) {
      console.error('Error in connectedCallback:', error);
    }
  }

  static get observedAttributes() {
    return ['clip', 'type', 'index'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    try {
      if (name === 'clip') {
        // Use the same multi-strategy parsing as in connectedCallback
        let parsedClip = null;
        try {
          parsedClip = newValue ? JSON.parse(newValue) : null;
        } catch (jsonError) {
          console.warn('Direct JSON parse failed, trying alternative parsing:', jsonError);
        }
        
        if (!parsedClip) {
          parsedClip = {
            text: newValue || 'Invalid Clip',
            timestamp: Date.now(),
            id: crypto.randomUUID(),
            type: 'recent'
          };
        }
        
        this.clip = parsedClip;
        this.render();
      }
      
      if (name === 'type') {
        this.type = newValue || 'recent';
        this.render();
      }
      
      if (name === 'index') {
        this.index = parseInt(newValue || '-1');
      }
    } catch (error) {
      console.error('Error in attributeChangedCallback:', error);
      this.clip = {
        text: 'Error Loading Clip',
        timestamp: Date.now(),
        id: crypto.randomUUID(),
        type: 'recent'
      };
      this.render();
    }
  }

  render() {
    console.log('Rendering ClipItem:', this.clip, 'Type:', this.type);

    // Limpa o shadowRoot
    this.shadowRoot.innerHTML = '';
    
    // Adiciona os estilos
    const styleSheet = document.createElement('style');
    styleSheet.textContent = '@import url("../../styles.css");';
    this.shadowRoot.appendChild(styleSheet);

    // Cria o elemento clip
    const clipElement = document.createElement('div');
    clipElement.className = 'clip-item';
    
    // Adiciona o texto
    const textElement = document.createElement('div');
    textElement.className = 'clip-text';
    textElement.textContent = this.clip.text || 'Empty clip';
    
    // Cria o componente favorite-actions
    const favoriteActions = document.createElement('favorite-actions');
    console.log('Creating favorite-actions with:', {
      clip: JSON.stringify(this.clip),
      isFavorite: this.type === 'favorites'
    });
    
    favoriteActions.setAttribute('clip', JSON.stringify(this.clip));
    favoriteActions.setAttribute('is-favorite', (this.type === 'favorites').toString());
    
    // Listen for favorite toggle events
    favoriteActions.addEventListener('toggle-favorite', (event) => {
      event.stopPropagation();
      this.dispatchEvent(new CustomEvent('toggle-favorite', { 
        detail: { 
          clip: this.clip, 
          index: this.index, 
          currentType: this.type 
        },
        bubbles: true,
        composed: true 
      }));
    });
    
    // Adiciona evento de clique para copiar
    clipElement.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.clip.text);
        clipElement.classList.add('clicked');
        
        this.dispatchEvent(new CustomEvent('clip-copied', { 
          detail: { clip: this.clip },
          bubbles: true,
          composed: true 
        }));
        
        setTimeout(() => {
          clipElement.classList.remove('clicked');
        }, 300);
      } catch (error) {
        console.error('Error copying clip:', error);
      }
    });
    
    // Monta a estrutura
    clipElement.appendChild(textElement);
    clipElement.appendChild(favoriteActions);
    
    // Adiciona ao shadowRoot
    this.shadowRoot.appendChild(clipElement);
    
    console.log('ClipItem rendered successfully');
  }

  setupEventListeners() {
    this.shadowRoot.addEventListener('click', (event) => {
      const copyBtn = event.target.closest('.copy-btn');
      const favoriteBtn = event.target.closest('.favorite-btn');

      if (copyBtn) {
        this.copyClip();
      }

      if (favoriteBtn) {
        this.toggleFavorite();
      }
    });
  }

  truncateText(text, maxLength = 50) {
    return text.length > maxLength 
      ? text.substring(0, maxLength) + '...' 
      : text;
  }

  copyClip() {
    if (this.clip) {
      navigator.clipboard.writeText(this.clip.text).then(() => {
        this.dispatchEvent(new CustomEvent('clip-copied', { 
          detail: { 
            clip: this.clip, 
            index: this.index,
            type: this.type 
          },
          bubbles: true 
        }));
      });
    }
  }

  toggleFavorite() {
    if (this.clip) {
      this.dispatchEvent(new CustomEvent('toggle-favorite', { 
        detail: { 
          clip: this.clip, 
          index: this.index, 
          currentType: this.type 
        },
        bubbles: true 
      }));
    }
  }
}

// Registra o componente personalizado
customElements.define('clip-item', ClipItem);

export default ClipItem;
