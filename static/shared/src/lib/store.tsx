import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Api } from '../api';

export type Route = 'home' | 'overview' | 'decisions' | 'promises' | 'incidents' | 'activity' | 'guide' | 'settings';
export type ThemeMode = 'light' | 'dark';

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

interface AppState {
  api: Api;
  route: Route;
  /** Optional parameter for the route, e.g. a decision id to open or a guide section. */
  param: string | null;
  go: (route: Route, param?: string | null) => void;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  /** Bumped whenever ledger data changes, so pages refetch. */
  version: number;
  touch: () => void;
  mode: 'ledger' | 'admin';
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

const remember = (key: string, value: string) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* storage can be blocked inside the Atlassian iframe */
  }
};
const recall = (key: string): string | null => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

export function AppProvider({ api, mode, initialTheme, children }: { api: Api; mode: 'ledger' | 'admin'; initialTheme: ThemeMode; children: ReactNode }) {
  const startRoute = (): Route => {
    if (mode === 'admin') return 'settings';
    const fromUrl = new URLSearchParams(window.location.search).get('page');
    return ((fromUrl ?? recall('precedent.route')) as Route | null) ?? 'home';
  };
  const [route, setRoute] = useState<Route>(startRoute);
  const [param, setParam] = useState<string | null>(null);
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [version, setVersion] = useState(0);
  const nextId = useRef(1);

  const go = useCallback((r: Route, p: string | null = null) => {
    setRoute(r);
    setParam(p);
    remember('precedent.route', r);
    document.querySelector('.main')?.scrollTo({ top: 0 });
  }, []);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-color-mode', t);
  }, []);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = nextId.current++;
    setToasts((ts) => [...ts, { id, text, tone }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3600);
  }, []);

  const touch = useCallback(() => setVersion((v) => v + 1), []);

  // Jira can switch theme while the app is open; follow the attribute it sets.
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const m = document.documentElement.getAttribute('data-color-mode');
      if (m === 'light' || m === 'dark') setThemeState(m);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-mode'] });
    return () => obs.disconnect();
  }, []);

  const value = useMemo(
    () => ({ api, route, param, go, theme, setTheme, toast, toasts, version, touch, mode }),
    [api, route, param, go, theme, setTheme, toast, toasts, version, touch, mode],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Small data hook: loading / error / data with refetch, re-run when the ledger version changes. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const { version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}
