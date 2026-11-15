import { invoke } from '@forge/bridge';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/** Calls a resolver and unwraps the { ok, data } envelope. Throws a readable Error on failure. */
export async function call<T>(name: string, payload?: Record<string, unknown>): Promise<T> {
  const res = (await invoke(name, payload)) as ApiResult<T>;
  if (!res || res.ok !== true) throw new Error(res?.error?.message ?? 'Precedent could not be reached.');
  return res.data;
}

export const formatDate = (iso: string | null): string => {
  if (!iso) return 'date not recorded';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
