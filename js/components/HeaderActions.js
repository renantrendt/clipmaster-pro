export default class HeaderActions extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .header-buttons {
                    display: flex;
                    align-items: center;
                    gap: 2px;
                }
                button {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 6px;
                    color: #666;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                }
                button:hover {
                    background-color: #f5f5f5;
                }
                button svg {
                    width: 1em;
                    height: 1em;
                    stroke: currentColor;
                }
                .pro-btn {
                    padding: 4px 12px;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: none;
                    border: 1px solid #e4e4e7;
                    color: #71717a;
                }
                .pro-btn.is-pro {
                    color: var(--primary-color);
                    font-weight: 600;
                }
            </style>
            <div class="header-buttons">
                <button id="settingsBtn" title="Settings">
                    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </button>
                <button id="pinBtn" title="Pin window">
                    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L12 22"></path>
                        <path d="M2 12L22 12"></path>
                    </svg>
                </button>
                <button id="proBtn" class="pro-btn" title="Upgrade to Pro">Free</button>
            </div>
        `;
    }

    setupEventListeners() {
        const settingsBtn = this.shadowRoot.getElementById('settingsBtn');
        const pinBtn = this.shadowRoot.getElementById('pinBtn');
        const proBtn = this.shadowRoot.getElementById('proBtn');

        settingsBtn.addEventListener('click', () => {
            const settingsModal = document.getElementById('settingsModal');
            settingsModal.style.display = 'block';
        });

        pinBtn.addEventListener('click', () => {
            // Implementar lógica de pin
            console.log('Pin button clicked');
        });

        proBtn.addEventListener('click', () => {
            // Implementar lógica de upgrade
            const proModal = document.getElementById('proModal');
            proModal.style.display = 'block';
        });
    }
}

customElements.define('header-actions', HeaderActions);
