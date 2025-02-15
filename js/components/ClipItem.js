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
      // Detailed logging of clip attribute
      const clipAttr = this.getAttribute('clip');
      console.log('Raw clip attribute:', clipAttr);
      console.log('Attribute type:', typeof clipAttr);
      console.log('Attribute length:', clipAttr ? clipAttr.length : 'N/A');
      
      // Extensive parsing strategies
      let parsedClip = null;
      
      // Strategy 1: Direct JSON parse with detailed error handling
      try {
        if (clipAttr) {
          // Log the exact string being parsed
          console.log('Attempting to parse:', clipAttr);
          
          // Validate string before parsing
          if (typeof clipAttr !== 'string') {
            throw new Error('Clip attribute is not a string');
          }
          
          // Trim and validate
          const trimmedAttr = clipAttr.trim();
          if (!trimmedAttr.startsWith('{') || !trimmedAttr.endsWith('}')) {
            throw new Error('Invalid JSON structure');
          }
          
          parsedClip = JSON.parse(trimmedAttr);
        }
      } catch (jsonError) {
        console.error('Direct JSON parse failed:', {
          message: jsonError.message,
          name: jsonError.name,
          stack: jsonError.stack
        });
      }
      
      // Strategy 2: Comprehensive error recovery
      if (!parsedClip) {
        try {
          // Multiple cleaning strategies
          const cleaningStrategies = [
            attr => attr.replace(/\\"/g, '"'),  // Unescape quotes
            attr => attr.replace(/\\/g, ''),    // Remove all backslashes
            attr => attr.replace(/\n/g, ' '),   // Replace newlines
            attr => attr.slice(1, -1)           // Remove outer quotes
          ];
          
          for (const cleanStrategy of cleaningStrategies) {
            try {
              const cleanedAttr = cleanStrategy(clipAttr);
              console.log('Trying cleaned attribute:', cleanedAttr);
              parsedClip = JSON.parse(cleanedAttr);
              if (parsedClip) break;
            } catch (cleanError) {
              console.warn('Cleaning strategy failed:', cleanError.message);
            }
          }
        } catch (recoveryError) {
          console.error('Comprehensive recovery failed:', recoveryError);
        }
      }
      
      // Strategy 3: Absolute fallback
      if (!parsedClip) {
        console.warn('All parsing strategies failed. Using fallback.');
        parsedClip = {
          text: clipAttr || 'Unrecoverable Clip',
          timestamp: Date.now(),
          id: crypto.randomUUID(),
          type: 'recent'
        };
      }
      
      // Final validation
      if (typeof parsedClip !== 'object' || parsedClip === null) {
        console.error('Invalid parsed clip:', parsedClip);
        parsedClip = {
          text: 'Invalid Clip Data',
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
      console.error('Catastrophic error in clip parsing:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      
      this.clip = {
        text: 'Unrecoverable Error',
        timestamp: Date.now(),
        id: crypto.randomUUID(),
        type: 'recent'
      };
      this.render();
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
          try {
            const cleanAttr = newValue
              .replace(/\\"/g, '"')
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t');
            
            parsedClip = JSON.parse(cleanAttr);
          } catch (cleanParseError) {
            console.warn('Cleaned JSON parse failed:', cleanParseError);
          }
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
    const styles = `
      <style>
        :host {
          display: block;
          margin-bottom: 8px;
        }
        .clip-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background-color: #f5f5f5;
          border-radius: 8px;
          padding: 10px;
          cursor: pointer;
          transition: background-color 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .clip-item:hover {
          background-color: #e9e9e9;
        }
        .clip-item.clicked::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 255, 0, 0.2);
          z-index: 1;
          animation: clickFeedback 0.3s ease-out;
        }
        @keyframes clickFeedback {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .clip-text {
          flex-grow: 1;
          margin-right: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: calc(100% - 40px);
          font-size: 14px;
          line-height: 1.4;
        }
        .action-btn {
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          transition: background-color 0.2s ease;
        }
        .action-btn:hover {
          background-color: rgba(0, 0, 0, 0.1);
        }
        .favorite-btn {
          stroke: currentColor;
          color: #666;
        }
        .favorite-btn.active {
          color: #007bff;
        }
        .favorite-btn svg {
          width: 16px;
          height: 16px;
        }
      </style>
    `;

    const clipElement = document.createElement('div');
    clipElement.className = 'clip-item';
    
    const textElement = document.createElement('div');
    textElement.className = 'clip-text';
    textElement.textContent = this.clip.text || 'Empty clip';
    
    const favoriteButton = document.createElement('button');
    const isFavorite = this.type === 'favorites';
    favoriteButton.className = `action-btn favorite-btn${isFavorite ? ' active' : ''}`;
    favoriteButton.innerHTML = `
      <svg width="10" height="14" viewBox="0 0 14 18" stroke="currentColor" fill="${isFavorite ? 'currentColor' : 'none'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 17l-6-4-6 4V3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    favoriteButton.title = isFavorite ? 'Remove from favorites' : 'Add to favorites';
    
    favoriteButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('toggle-favorite', { 
        detail: { clip: this.clip },
        bubbles: true,
        composed: true 
      }));
    });
    
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
    
    clipElement.appendChild(textElement);
    clipElement.appendChild(favoriteButton);
    
    this.shadowRoot.innerHTML = styles + clipElement.outerHTML;
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

export default ClipItem;
