import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { hydrated } from './store/store';
import { initSync } from './store/sync';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

registerSW({ immediate: true });

// resume syncing once the saved data is loaded; a #c=CODE link connects this device
void hydrated.then(() => initSync().then((r) => r && window.dispatchEvent(new CustomEvent('mv-link', { detail: r }))));
