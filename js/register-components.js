import HeaderActions from './components/HeaderActions.js';
import Tabs from './components/Tabs.js';
import ClipItem from './components/ClipItem.js';

// Check if component is already registered before defining
if (!customElements.get('header-actions')) {
  customElements.define('header-actions', HeaderActions);
}

if (!customElements.get('app-tabs')) {
  customElements.define('app-tabs', Tabs);
}

if (!customElements.get('clip-item')) {
  customElements.define('clip-item', ClipItem);
}
