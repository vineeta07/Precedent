import type { LedgerRepository } from './repository';
import { computeKpis, panelVerdict, supersedeChain, type LedgerKpis, type PanelVerdict } from './rules';
import type { Commitment, Decision, Flag, HistoryEntry, Incident } from './types';

/** Read models used by the issue panel, the dashboard, the byline and the Rovo actions. Ledger reads only: no LLM. */

export interface FlagCard {
  flagId: string;
  workItemKey: string;
  kind: Flag['kind'];
  confidence: number;
  explanation: string;
  dismissed: boolean;
  createdAt: string;
  target: {
    type: Flag['targetType'];
    id: string;
    key: string;
    title: string;
    statement: string;
    snippet: string;
    sourceUrl: string | null;
    sourceLabel: string;
    ownerName: string | null;
    ownerAccountId: string | null;
    date: string | null;
    status: string;
    /** True when the current user may not see the source; snippet and link are withheld. */
    restricted: boolean;
  };
}

export interface PanelView {
  workItemKey: string;
  verdict: PanelVerdict;
  cards: FlagCard[];
  ledgerEmpty: boolean;
}

export type SourceVisibility = (sourceType: string, sourceId: string | null) => boolean;
const allVisible: SourceVisibility = () => true;

const sourceLabel = (type: string) =>
  type === 'confluence' ? 'Confluence page' : type === 'jsm_pir' ? 'Post-incident review' : type === 'jira_comment' ? 'Jira comment' : type === 'sample' ? 'Sample data' : 'Recorded manually';

export async function flagCards(repo: LedgerRepository, flags: Flag[], visible: SourceVisibility = allVisible): Promise<FlagCard[]> {
  const cards: FlagCard[] = [];
  for (const f of flags) {
    let target: FlagCard['target'] | null = null;
    if (f.targetType === 'decision') {
      const d = await repo.getDecision(f.targetId);
      if (!d || d.status === 'superseded' || d.status === 'rejected') continue;
      const ok = visible(d.sourceType, d.sourceId);
      target = {
        type: 'decision',
        id: d.id,
        key: d.key,
        title: d.title,
        statement: d.statement,
        snippet: ok ? d.sourceSnippet : '',
        sourceUrl: ok ? d.sourceUrl : null,
        sourceLabel: sourceLabel(d.sourceType),
        ownerName: d.ownerName,
        ownerAccountId: d.ownerAccountId,
        date: d.decidedAt,
        status: d.status,
        restricted: !ok,
      };
    } else if (f.targetType === 'promise') {
      const p = await repo.getPromise(f.targetId);
      if (!p) continue;
      const ok = visible(p.originType === 'jsm_pir' ? 'confluence' : p.originType, p.originId);
      target = {
        type: 'promise',
        id: p.id,
        key: p.key,
        title: p.statement,
        statement: p.statement,
        snippet: ok ? p.sourceSnippet : '',
        sourceUrl: ok ? p.sourceUrl : null,
        sourceLabel: sourceLabel(p.originType),
        ownerName: p.ownerName,
        ownerAccountId: p.ownerAccountId,
        date: p.dueDate,
        status: p.status,
        restricted: !ok,
      };
    } else {
      const inc = await repo.getIncident(f.targetId);
      if (!inc) continue;
      target = {
        type: 'incident',
        id: inc.key,
        key: inc.key,
        title: inc.summary,
        statement: inc.summary,
        snippet: inc.description,
        sourceUrl: inc.postmortemUrl,
        sourceLabel: 'Past incident',
        ownerName: null,
        ownerAccountId: null,
        date: inc.occurredAt,
        status: 'incident',
        restricted: false,
      };
    }
    cards.push({
      flagId: f.id,
      workItemKey: f.workItemKey,
      kind: f.kind,
      confidence: f.confidence,
      explanation: f.explanation,
      dismissed: f.dismissed,
      createdAt: f.createdAt,
      target,
    });
  }
  const order: Record<Flag['kind'], number> = { conflict: 0, deja_vu: 1, open_promise: 2, revisits: 3 };
  return cards.sort((a, b) => order[a.kind] - order[b.kind] || b.confidence - a.confidence);
}

export async function buildPanelView(repo: LedgerRepository, workItemKey: string, visible: SourceVisibility = allVisible): Promise<PanelView> {
  const flags = await repo.listFlags(workItemKey);
  const cards = await flagCards(repo, flags, visible);
  const deja = cards.find((c) => c.kind === 'deja_vu');
  const counts = await repo.counts();
  return {
    workItemKey: workItemKey.toUpperCase(),
    verdict: panelVerdict(
      cards.map((c) => ({ kind: c.kind, dismissed: false })),
      deja?.target.key ?? null,
      cards.filter((c) => c.kind === 'open_promise').length,
    ),
    cards,
    ledgerEmpty: counts.decisions + counts.promises + counts.incidents === 0,
  };
}

/* ---------------------------------------------------------------- dashboard */

export interface MonthPoint {
  month: string;
  kept: number;
  missed: number;
  decisions: number;
}

export interface OwnerRow {
  name: string;
  accountId: string | null;
  kept: number;
  open: number;
  missed: number;
}

export interface ActivityRow {
  id: string;
  at: string;
  kind: string;
  detail: string;
  entityKey: string;
  entityType: 'decision' | 'promise';
  entityId: string;
}

export interface DashboardSummary {
  kpis: LedgerKpis;
  months: MonthPoint[];
  owners: OwnerRow[];
  tags: { tag: string; count: number }[];
  activity: ActivityRow[];
  needsAttention: Commitment[];
  hasSample: boolean;
  empty: boolean;
}

const monthOf = (iso: string | null) => (iso && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : null);

export function monthSeries(decisions: Decision[], promises: Commitment[], now = new Date(), span = 8): MonthPoint[] {
  const months: MonthPoint[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ month: d.toISOString().slice(0, 7), kept: 0, missed: 0, decisions: 0 });
  }
  const by = new Map(months.map((m) => [m.month, m]));
  for (const d of decisions) {
    const m = by.get(monthOf(d.decidedAt ?? d.createdAt) ?? '');
    if (m && d.status !== 'rejected') m.decisions++;
  }
  for (const p of promises) {
    const m = by.get(monthOf(p.dueDate) ?? '');
    if (!m) continue;
    if (p.status === 'kept') m.kept++;
    else if (p.status === 'broken' || p.status === 'overdue') m.missed++;
  }
  return months;
}

export function ownerTable(promises: Commitment[]): OwnerRow[] {
  const rows = new Map<string, OwnerRow>();
  for (const p of promises) {
    const name = p.ownerName ?? 'Unassigned';
    const row = rows.get(name) ?? { name, accountId: p.ownerAccountId, kept: 0, open: 0, missed: 0 };
    if (p.status === 'kept') row.kept++;
    else if (p.status === 'open') row.open++;
    else row.missed++;
    rows.set(name, row);
  }
  return [...rows.values()].sort((a, b) => b.kept + b.open + b.missed - (a.kept + a.open + a.missed)).slice(0, 8);
}

export async function buildSummary(repo: LedgerRepository, now = new Date()): Promise<DashboardSummary> {
  const [decisions, promises, flags, history, counts] = await Promise.all([
    repo.listDecisions(),
    repo.listPromises(),
    repo.listAllFlags(1000),
    repo.recentHistory(40),
    repo.counts(),
  ]);
  const tagCounts = new Map<string, number>();
  for (const d of decisions) for (const t of d.scopeTags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const byId = new Map<string, { key: string; type: 'decision' | 'promise' }>();
  for (const d of decisions) byId.set(d.id, { key: d.key, type: 'decision' });
  for (const p of promises) byId.set(p.id, { key: p.key, type: 'promise' });
  const activity: ActivityRow[] = [];
  for (const h of history) {
    const e = byId.get(h.entityId);
    if (!e) continue;
    activity.push({ id: h.id, at: h.at, kind: h.kind, detail: h.detail, entityKey: e.key, entityType: e.type, entityId: h.entityId });
  }
  return {
    kpis: computeKpis(decisions, promises, flags),
    months: monthSeries(decisions, promises, now),
    owners: ownerTable(promises),
    tags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 12),
    activity: activity.slice(0, 12),
    needsAttention: promises
      .filter((p) => p.status === 'overdue' || p.status === 'broken')
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
      .slice(0, 6),
    hasSample: counts.sample > 0,
    empty: decisions.length + promises.length === 0,
  };
}

export interface DecisionDetail {
  decision: Decision;
  chain: Decision[];
  flaggedWork: { workItemKey: string; kind: Flag['kind']; confidence: number; explanation: string; dismissed: boolean }[];
  promises: Commitment[];
  history: HistoryEntry[];
}

export async function buildDecisionDetail(repo: LedgerRepository, idOrKey: string): Promise<DecisionDetail | null> {
  const decision = await repo.getDecision(idOrKey);
  if (!decision) return null;
  const all = await repo.listDecisions({ limit: 1000 });
  const chain = supersedeChain(decision, new Map(all.map((d) => [d.id, d])));
  const flags = (await repo.listAllFlags(1000)).filter((f) => f.targetType === 'decision' && f.targetId === decision.id);
  const promises = decision.sourceId ? await repo.listPromises({ originId: decision.sourceId }) : [];
  return {
    decision,
    chain,
    flaggedWork: flags.map((f) => ({ workItemKey: f.workItemKey, kind: f.kind, confidence: f.confidence, explanation: f.explanation, dismissed: f.dismissed })),
    promises,
    history: await repo.historyFor(decision.id),
  };
}

export interface IncidentRow {
  incident: Incident;
  promises: Commitment[];
  openPromises: number;
  recurrences: { workItemKey: string; confidence: number; explanation: string; at: string }[];
}

export async function buildIncidentRows(repo: LedgerRepository): Promise<IncidentRow[]> {
  const [incidents, promises, flags] = await Promise.all([repo.listIncidents(), repo.listPromises(), repo.listAllFlags(1000)]);
  return incidents
    .map((incident) => {
      const mine = promises.filter((p) => p.originId === incident.key);
      return {
        incident,
        promises: mine,
        openPromises: mine.filter((p) => p.status !== 'kept').length,
        recurrences: flags
          .filter((f) => f.kind === 'deja_vu' && f.targetId === incident.key && !f.dismissed)
          .map((f) => ({ workItemKey: f.workItemKey, confidence: f.confidence, explanation: f.explanation, at: f.createdAt })),
      };
    })
    .sort((a, b) => b.recurrences.length - a.recurrences.length || (b.incident.occurredAt ?? '').localeCompare(a.incident.occurredAt ?? ''));
}
