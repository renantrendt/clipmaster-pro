export default class Tabs extends HTMLElement {
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
                .tabs {
                    display: flex;
                    justify-content: stretch;
                    border-bottom: 1px solid var(--border-color);
                    margin-bottom: 1rem;
                    position: relative;
                    margin-top: -4px;
                }

                .tab-btn {
                    flex: 1;
                    padding: 0.75rem 1rem;
                    border: none;
                    background: none;
                    color: var(--secondary-color);
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    position: relative;
                    transition: color 0.2s;
                }

                .tab-btn.active {
                    color: var(--primary-color);
                }

                .tab-indicator {
                    position: absolute;
                    bottom: -1px;
                    height: 2px;
                    width: 50%;
                    background-color: var(--primary-color);
                    transition: transform 0.3s ease;
                }

                .tab-btn[data-tab="favorites"].active ~ .tab-indicator {
                    transform: translateX(100%);
                }
            </style>
            <nav class="tabs">
                <button id="recentTab" class="tab-btn active" data-tab="recent">Recent</button>
                <button id="favoritesTab" class="tab-btn" data-tab="favorites">Favorites</button>
                <div class="tab-indicator"></div>
            </nav>
        `;
    }

    setupEventListeners() {
        const recentTab = this.shadowRoot.getElementById('recentTab');
        const favoritesTab = this.shadowRoot.getElementById('favoritesTab');
        const tabIndicator = this.shadowRoot.querySelector('.tab-indicator');

        const switchTab = (activeTab, inactiveTab) => {
            activeTab.classList.add('active');
            inactiveTab.classList.remove('active');

            // Dispatch a custom event to notify the parent about tab change
            const event = new CustomEvent('tab-change', {
                detail: { 
                    activeTab: activeTab.dataset.tab 
                },
                bubbles: true,
                composed: true
            });
            this.dispatchEvent(event);
        };

        recentTab.addEventListener('click', () => {
            switchTab(recentTab, favoritesTab);
        });

        favoritesTab.addEventListener('click', () => {
            switchTab(favoritesTab, recentTab);
        });
    }
}

customElements.define('app-tabs', Tabs);
