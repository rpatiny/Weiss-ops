import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './app/theme';
import { I18nProvider } from './i18n';
import { ToastProvider } from './components/ui/Toast';
import { db } from './data/db';
import { CLOUD } from './data/cloud/runtime';
import { CloudGate } from './modules/auth/CloudGate';
import { StartupDisclaimer } from './components/layout/Disclaimer';
import './index.css';

// Popula a base com dados de demonstração no primeiro acesso.
db.ensureInitialized();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <StartupDisclaimer />
          {CLOUD ? (
            <CloudGate>
              <App />
            </CloudGate>
          ) : (
            <App />
          )}
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
