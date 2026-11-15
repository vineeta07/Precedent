import type {
  Commitment,
  Decision,
  DecisionStatus,
  Flag,
  FlagKind,
  LedgerSettings,
  PromiseStatus,
} from './types';

/* ---------------------------------------------------------------- thresholds */

export type FlagRouting = 'ignore' | 'panel' | 'panel_and_comment';

export function routeFlag(confidence: number, settings: Pick<LedgerSettings, 'ignoreBelow' | 'commentAbove' | 'postComments'>): FlagRouting {
  if (!Number.isFinite(confidence) || confidence < settings.ignoreBelow) return 'ignore';
  if (confidence > settings.commentAbove && settings.postComments) return 'panel_and_comment';
  return 'panel';
}

/* ----------------------------------------------------------- promise status */

export interface LinkedIssueState {
  statusCategory: 'new' | 'indeterminate' | 'done' | string;
  resolution: string | null;
}

const BROKEN_RESOLUTIONS = /won'?t\s*(do|fix)|declined|cancel|obsolete|abandon|duplicate/i;
/** A promise past due by this many days with no progress is considered broken, not just overdue. */
export const BROKEN_AFTER_DAYS = 45;

export function derivePromiseStatus(
  p: Pick<Commitment, 'dueDate' | 'status'>,
  linked: LinkedIssueState | null,
  now: Date = new Date(),
): PromiseStatus {
  if (linked) {
    if (linked.statusCategory === 'done') {
      return linked.resolution && BROKEN_RESOLUTIONS.test(linked.resolution) ? 'broken' : 'kept';
    }
  } else if (p.status === 'kept' || p.status === 'broken') {
    // Manually resolved promises without a linked issue keep their status.
    return p.status;
  }
  if (p.dueDate) {
    const due = new Date(p.dueDate + (p.dueDate.length === 10 ? 'T23:59:59Z' : ''));
    if (!Number.isNaN(due.getTime()) && due.getTime() < now.getTime()) {
      const daysLate = (now.getTime() - due.getTime()) / 86_400_000;
      const untouched = !linked || linked.statusCategory === 'new';
      return daysLate > BROKEN_AFTER_DAYS && untouched ? 'broken' : 'overdue';
    }
  }
  return 'open';
}

/* ------------------------------------------------------------------ metrics */

export interface LedgerKpis {
  decisionsTracked: number;
  decisionsAccepted: number;
  promisesOpen: number;
  promisesOverdue: number;
  promisesKept: number;
  promisesBroken: number;
  /** null when no promise has come due yet. */
  keepRate: number | null;
  repeatIncidentsCaught: number;
  conflictsCaught: number;
}

/** Keep rate counts only promises whose outcome is known or due: kept / (kept + broken + overdue). */
export function keepRate(promises: Pick<Commitment, 'status'>[]): number | null {
  let kept = 0;
  let due = 0;
  for (const p of promises) {
    if (p.status === 'kept') {
      kept++;
      due++;
    } else if (p.status === 'broken' || p.status === 'overdue') due++;
  }
  return due === 0 ? null : Math.round((kept / due) * 1000) / 10;
}

export function computeKpis(
  decisions: Pick<Decision, 'status'>[],
  promises: Pick<Commitment, 'status'>[],
  flags: Pick<Flag, 'kind' | 'dismissed' | 'workItemKey'>[],
): LedgerKpis {
  const count = (s: PromiseStatus) => promises.filter((p) => p.status === s).length;
  const distinct = (kind: FlagKind) => new Set(flags.filter((f) => f.kind === kind && !f.dismissed).map((f) => f.workItemKey)).size;
  return {
    decisionsTracked: decisions.filter((d) => d.status !== 'rejected').length,
    decisionsAccepted: decisions.filter((d) => d.status === 'accepted').length,
    promisesOpen: count('open'),
    promisesOverdue: count('overdue'),
    promisesKept: count('kept'),
    promisesBroken: count('broken'),
    keepRate: keepRate(promises),
    repeatIncidentsCaught: distinct('deja_vu'),
    conflictsCaught: distinct('conflict'),
  };
}

/* --------------------------------------------------------- decision lifecycle */

const TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  proposed: ['accepted', 'rejected'],
  accepted: ['superseded'],
  superseded: [],
  rejected: ['proposed'],
};

export function canTransition(from: DecisionStatus, to: DecisionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class LifecycleError extends Error {}

export function assertTransition(from: DecisionStatus, to: DecisionStatus): void {
  if (!canTransition(from, to)) {
    throw new LifecycleError(`A ${from} decision cannot become ${to}.`);
  }
}

/** Walk the supersede chain oldest → newest. Guards against cycles. */
export function supersedeChain(start: Decision, byId: Map<string, Decision>): Decision[] {
  // walk back to the root
  const predecessors = new Map<string, Decision>();
  for (const d of byId.values()) if (d.supersededBy) predecessors.set(d.supersededBy, d);
  let root = start;
  const seen = new Set<string>([root.id]);
  while (predecessors.has(root.id)) {
    const prev = predecessors.get(root.id) as Decision;
    if (seen.has(prev.id)) break;
    seen.add(prev.id);
    root = prev;
  }
  const chain: Decision[] = [root];
  const visited = new Set<string>([root.id]);
  let cur = root;
  while (cur.supersededBy && byId.has(cur.supersededBy) && !visited.has(cur.supersededBy)) {
    cur = byId.get(cur.supersededBy) as Decision;
    visited.add(cur.id);
    chain.push(cur);
  }
  return chain;
}

/* ------------------------------------------------------------------ verdict */

export interface PanelVerdict {
  tone: 'conflict' | 'dejavu' | 'promise' | 'clear';
  text: string;
}

export function panelVerdict(
  flags: Pick<Flag, 'kind' | 'dismissed'>[],
  dejaVuIncidentKey?: string | null,
  openPromisesOnIncident = 0,
): PanelVerdict {
  const live = flags.filter((f) => !f.dismissed);
  const conflicts = live.filter((f) => f.kind === 'conflict').length;
  const deja = live.filter((f) => f.kind === 'deja_vu').length;
  const promises = live.filter((f) => f.kind === 'open_promise').length;
  const revisits = live.filter((f) => f.kind === 'revisits').length;
  if (conflicts > 0) {
    return { tone: 'conflict', text: `Conflicts with ${conflicts} decision${conflicts === 1 ? '' : 's'}` };
  }
  if (deja > 0) {
    const n = openPromisesOnIncident || promises;
    const tail = n > 0 ? ` — ${n} promise${n === 1 ? '' : 's'} still open` : '';
    return { tone: 'dejavu', text: `Looks like ${dejaVuIncidentKey ?? 'a past incident'}${tail}` };
  }
  if (promises > 0) {
    return { tone: 'promise', text: `${promises} related promise${promises === 1 ? ' is' : 's are'} still open` };
  }
  if (revisits > 0) {
    return { tone: 'promise', text: `Revisits ${revisits} earlier decision${revisits === 1 ? '' : 's'}` };
  }
  return { tone: 'clear', text: 'No precedents found' };
}

/* ----------------------------------------------------------------- debounce */

export const DEBOUNCE_SECONDS = 60;

/**
 * Edits arriving within the debounce window collapse into one guard run.
 * The trigger stores the latest event timestamp; a queued run only proceeds if it is still the latest.
 */
export function shouldRunGuard(eventTs: number, latestTs: number | null, lastContentHash: string | null, contentHash: string): boolean {
  if (latestTs !== null && eventTs < latestTs) return false;
  if (lastContentHash !== null && lastContentHash === contentHash) return false;
  return true;
}
