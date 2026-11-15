import { kvs } from '@forge/kvs';
import { DEFAULT_SETTINGS, type LedgerSettings } from '../ledger/types';

const KEY = 'precedent:settings';

export async function getSettings(): Promise<LedgerSettings> {
  const stored = (await kvs.get<Partial<LedgerSettings>>(KEY)) ?? {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function sanitizeSettings(input: Partial<LedgerSettings>, current: LedgerSettings): LedgerSettings {
  const clamp = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(0.99, Math.max(0.3, n)) : fallback;
  };
  const list = (v: unknown, fallback: string[]) =>
    Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 100) : fallback;
  const next: LedgerSettings = {
    ignoreBelow: clamp(input.ignoreBelow, current.ignoreBelow),
    commentAbove: clamp(input.commentAbove, current.commentAbove),
    postComments: typeof input.postComments === 'boolean' ? input.postComments : current.postComments,
    guardProjects: list(input.guardProjects, current.guardProjects).map((s) => s.toUpperCase()),
    scanSpaces: list(input.scanSpaces, current.scanSpaces),
    onboarded: typeof input.onboarded === 'boolean' ? input.onboarded : current.onboarded,
    useTeamworkGraph: typeof input.useTeamworkGraph === 'boolean' ? input.useTeamworkGraph : current.useTeamworkGraph,
  };
  if (next.commentAbove < next.ignoreBelow) next.commentAbove = next.ignoreBelow;
  return next;
}

export async function saveSettings(input: Partial<LedgerSettings>): Promise<LedgerSettings> {
  const next = sanitizeSettings(input, await getSettings());
  await kvs.set(KEY, next);
  return next;
}

/** Small transient state (debounce markers, scan progress). */
export const state = {
  get: <T>(key: string) => kvs.get<T>(`precedent:state:${key}`),
  set: <T>(key: string, value: T) => kvs.set(`precedent:state:${key}`, value),
  del: (key: string) => kvs.delete(`precedent:state:${key}`),
};
