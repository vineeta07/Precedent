import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/app.css';
import './styles/pages.css';
import { getApi, inAtlassian } from './api';
import { App } from './App';
import { AppProvider, type ThemeMode } from './lib/store';

async function resolveTheme(): Promise<ThemeMode> {
  if (inAtlassian()) {
    try {
      const { view } = await import('@forge/bridge');
      await view.theme.enable();
    } catch {
      /* theming is best-effort */
    }
    return document.documentElement.getAttribute('data-color-mode') === 'dark' ? 'dark' : 'light';
  }
  const asked = new URLSearchParams(window.location.search).get('theme');
  const mode: ThemeMode = asked === 'dark' || asked === 'light' ? asked : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-color-mode', mode);
  return mode;
}

export async function boot(mode: 'ledger' | 'admin'): Promise<void> {
  const [api, theme] = await Promise.all([getApi(), resolveTheme()]);
  const root = document.getElementById('root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <AppProvider api={api} mode={mode} initialTheme={theme}>
        <App />
      </AppProvider>
    </StrictMode>,
  );
}
