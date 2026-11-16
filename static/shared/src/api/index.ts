import type { Api } from './types';

export * from './types';

/** Inside Atlassian the app always runs in an iframe. Anywhere else we show the local preview. */
export const inAtlassian = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

let cached: Promise<Api> | null = null;
export function getApi(): Promise<Api> {
  if (!cached) cached = inAtlassian() ? import('./forge').then((m) => m.forgeApi) : import('../mock/backend').then((m) => m.mockApi);
  return cached;
}
