export function formatDate(iso: string | null | undefined, opts: { short?: boolean } = {}): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: opts.short ? undefined : 'numeric', timeZone: 'UTC' });
}

export function monthLabel(ym: string): string {
  const d = new Date(ym + '-01T00:00:00Z');
  return d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
}

export function relative(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} y ago`;
}

export function daysLate(due: string | null, now = Date.now()): number {
  if (!due) return 0;
  return Math.max(0, Math.floor((now - new Date(due + 'T23:59:59Z').getTime()) / 86_400_000));
}

const AVATAR_COLOURS = ['#8a2d3b', '#33577f', '#2f6650', '#9a6b1c', '#5d4a7a', '#7a4a2a', '#3d6470'];
export function avatarColour(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length] as string;
}
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '')).toUpperCase();
}

export const KIND_LABEL: Record<string, string> = {
  conflict: 'Conflict',
  deja_vu: 'Déjà vu',
  open_promise: 'Open promise',
  revisits: 'Revisits',
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.';
}
