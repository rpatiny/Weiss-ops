import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './app/theme';
import { I18nProvider } from './i18n';
import { ToastProvider } from './components/ui/Toast';
import { db } from './data/db';
import './index.css';

// Popula a base com dados de demonstração no primeiro acesso.
db.ensureInitialized();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
