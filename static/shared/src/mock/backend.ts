import type { Api, Commitment, DecisionDetailView, DecisionRow, FlagCard, IncidentRow, LedgerSettings, SummaryResponse, EvalReport } from '../api/types';
import fixture from './fixture.json';

/**
 * Local preview backend. Only used when the app runs outside Atlassian (npm run ui:dev, screenshots).
 * The data is produced by scripts/build-mock.ts from the real pipeline; this file adds small in-memory edits.
 */
const wait = <T,>(value: T, ms = 380): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(value)), ms));

const db = structuredClone(fixture) as unknown as {
  summary: SummaryResponse['summary'];
  decisions: DecisionRow[];
  details: Record<string, DecisionDetailView>;
  promises: Commitment[];
  incidents: IncidentRow[];
  flags: FlagCard[];
  eval: EvalReport;
};
const emptyDb = { decisions: [] as DecisionRow[], promises: [] as Commitment[], incidents: [] as IncidentRow[], flags: [] as FlagCard[] };

let settings: LedgerSettings = { ignoreBelow: 0.55, commentAbove: 0.8, postComments: false, guardProjects: [], scanSpaces: [], onboarded: true, useTeamworkGraph: false };
const params = new URLSearchParams(window.location.search);
let loaded = params.get('empty') === null;
let scan = { startedAt: 0, total: 0 };

function recount(): void {
  const k = db.summary.kpis;
  const n = (s: string) => db.promises.filter((p) => p.status === s).length;
  k.promisesOpen = n('open');
  k.promisesKept = n('kept');
  k.promisesBroken = n('broken');
  k.promisesOverdue = n('overdue');
  const due = k.promisesKept + k.promisesBroken + k.promisesOverdue;
  k.keepRate = due ? Math.round((k.promisesKept / due) * 1000) / 10 : null;
  k.decisionsTracked = db.decisions.filter((d) => d.status !== 'rejected').length;
  k.decisionsAccepted = db.decisions.filter((d) => d.status === 'accepted').length;
  db.summary.needsAttention = db.promises.filter((p) => p.status === 'overdue' || p.status === 'broken').slice(0, 6);
}

const emptySummary = (): SummaryResponse['summary'] => ({
  ...db.summary,
  kpis: { decisionsTracked: 0, decisionsAccepted: 0, promisesOpen: 0, promisesOverdue: 0, promisesKept: 0, promisesBroken: 0, keepRate: null, repeatIncidentsCaught: 0, conflictsCaught: 0 },
  months: db.summary.months.map((m) => ({ ...m, kept: 0, missed: 0, decisions: 0 })),
  owners: [],
  tags: [],
  activity: [],
  needsAttention: [],
  hasSample: false,
  empty: true,
});

export const mockApi: Api = {
  preview: true,
  summary: () => wait({ summary: loaded ? db.summary : emptySummary(), settings, isAdmin: params.get('member') === null }),
  decisions: (f) => {
    const q = (f.search ?? '').toLowerCase();
    return wait(
      (loaded ? db.decisions : emptyDb.decisions).filter(
        (d) =>
          (!f.status || f.status === 'all' || d.status === f.status) &&
          (!f.tag || d.scopeTags.includes(f.tag)) &&
          (!q || `${d.key} ${d.title} ${d.statement}`.toLowerCase().includes(q)),
      ),
    );
  },
  decision: (id) => {
    const detail = db.details[id];
    if (!detail) return Promise.reject(new Error('Decision not found.'));
    const row = db.decisions.find((d) => d.id === id);
    return wait({ ...detail, decision: { ...detail.decision, ...(row ?? {}) } });
  },
  promises: (f) => {
    const q = (f.search ?? '').toLowerCase();
    return wait(
      (loaded ? db.promises : emptyDb.promises).filter(
        (p) => (!f.status || f.status === 'all' || p.status === f.status) && (!q || `${p.key} ${p.statement} ${p.ownerName ?? ''} ${p.linkedIssueKey ?? ''}`.toLowerCase().includes(q)),
      ),
    );
  },
  incidents: () => wait(loaded ? db.incidents : emptyDb.incidents),
  flags: () => wait(loaded ? db.flags.filter((f) => !f.dismissed) : emptyDb.flags),
  setDecisionStatus: (id, status) => {
    const d = db.decisions.find((x) => x.id === id);
    if (!d) return Promise.reject(new Error('Decision not found.'));
    d.status = status;
    const detail = db.details[id];
    detail?.history.push({ id: String(Date.now()), entityId: id, kind: `status:${status}`, actorAccountId: null, detail: `Status changed to ${status}`, at: new Date().toISOString() });
    recount();
    return wait(d);
  },
  supersede: (id, input) => {
    const old = db.decisions.find((x) => x.id === id);
    if (!old) return Promise.reject(new Error('Decision not found.'));
    const max = Math.max(...db.decisions.map((d) => Number(d.key.split('-')[1])));
    const now = new Date().toISOString();
    const next: DecisionRow = {
      ...old,
      id: `new-${Date.now()}`,
      key: `DEC-${max + 1}`,
      title: input.statement.slice(0, 120),
      statement: input.statement,
      rationale: input.reason,
      alternativesRejected: [],
      status: 'accepted',
      supersededBy: null,
      sourceType: 'manual',
      sourceSnippet: input.statement,
      ownerName: 'You',
      decidedAt: now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
      confidence: 1,
    };
    old.status = 'superseded';
    old.supersededBy = next.id;
    db.decisions.unshift(next);
    const oldDetail = db.details[id];
    if (oldDetail) {
      oldDetail.history.push({ id: `h${Date.now()}`, entityId: id, kind: 'superseded', actorAccountId: null, detail: `Superseded by ${next.key}: ${input.reason}`, at: now });
      oldDetail.chain = [...oldDetail.chain.map((c) => (c.id === id ? { ...old } : c)), next];
      db.details[next.id] = { decision: next, chain: oldDetail.chain, flaggedWork: [], promises: [], history: [{ id: `h${Date.now()}b`, entityId: next.id, kind: 'supersedes', actorAccountId: null, detail: `Supersedes ${old.key}: ${input.reason}`, at: now }], restricted: false };
    }
    db.flags = db.flags.filter((f) => f.target.id !== id);
    recount();
    return wait({ old, next });
  },
  explain: (id) => {
    const d = db.decisions.find((x) => x.id === id);
    if (!d) return Promise.reject(new Error('Decision not found.'));
    return wait(
      {
        summary: `${d.key} — ${d.title} (${d.status}). ${d.statement}${d.rationale ? ` Why: ${d.rationale}` : ''}${d.alternativesRejected.length ? ` Rejected: ${d.alternativesRejected.join('; ')}.` : ''} Owner: ${d.ownerName ?? 'not recorded'}${d.decidedAt ? `, decided ${d.decidedAt}` : ''}. Source: “${d.sourceSnippet}”`,
        citations: [d.sourceUrl ?? d.key],
      },
      900,
    );
  },
  setPromiseStatus: (id, status) => {
    const p = db.promises.find((x) => x.id === id);
    if (p) p.status = status;
    recount();
    return wait(p ?? null);
  },
  linkPromise: (id, issueKey) => {
    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(issueKey.toUpperCase())) return Promise.reject(new Error('That does not look like a work item key (for example PAY-123).'));
    const p = db.promises.find((x) => x.id === id);
    if (p) p.linkedIssueKey = issueKey.toUpperCase();
    return wait(p ?? null);
  },
  feedback: (flagId, verdict) => {
    const f = db.flags.find((x) => x.flagId === flagId);
    if (f && verdict === 'not_related') f.dismissed = true;
    return wait({ dismissed: verdict === 'not_related' });
  },
  saveSettings: (patch) => {
    settings = { ...settings, ...patch };
    return wait(settings, 500);
  },
  options: () =>
    wait({
      spaces: [
        { id: '101', key: 'ENG', name: 'Engineering' },
        { id: '102', key: 'PAY', name: 'Payments' },
        { id: '103', key: 'SRE', name: 'SRE' },
        { id: '104', key: 'MOB', name: 'Mobile' },
      ],
      projects: [
        { id: '1', key: 'PAY', name: 'Payments', projectTypeKey: 'software' },
        { id: '2', key: 'DASH', name: 'Merchant Dashboard', projectTypeKey: 'software' },
        { id: '3', key: 'INC', name: 'Incidents', projectTypeKey: 'service_desk' },
      ],
    }),
  startScan: (spaceIds) => {
    scan = { startedAt: Date.now(), total: spaceIds.length * 9 };
    return wait({ total: scan.total });
  },
  scanProgress: () => {
    const elapsed = (Date.now() - scan.startedAt) / 1000;
    const done = scan.total ? Math.min(scan.total, Math.floor(elapsed * 2.2)) : 0;
    if (scan.total && done >= scan.total) loaded = true;
    const counts = loaded ? { decisions: db.decisions.length, promises: db.promises.length, incidents: db.incidents.length, flags: db.flags.length, sample: 14 } : { decisions: 0, promises: 0, incidents: 0, flags: 0, sample: 0 };
    return wait({ running: scan.total > 0 && done < scan.total, total: scan.total, done, failed: 0, counts }, 200);
  },
  loadSample: (input) => {
    loaded = true;
    return wait(
      {
        decisions: 14,
        promises: 13,
        incidents: 7,
        pagesCreated: input.spaceId ? 3 : 0,
        issuesCreated: input.projectKey ? 6 : 0,
        tryKeys: [
          { slug: 'firebase', key: 'PAY-482', real: Boolean(input.projectKey) },
          { slug: 'checkout-again', key: 'INC-231', real: Boolean(input.projectKey) },
          { slug: 'clean', key: 'PAY-490', real: Boolean(input.projectKey) },
        ],
        warnings: [],
      },
      1400,
    );
  },
  clearSample: () => {
    loaded = false;
    return wait({ cleared: true }, 700);
  },
  sync: () => wait({ checked: db.promises.length, changed: 0 }, 1100),
  health: () =>
    wait({
      sql: true,
      llm: true,
      models: ['small model (preview)', 'large model (preview)'],
      small: 'small model (preview)',
      large: 'large model (preview)',
      counts: { decisions: db.decisions.length, promises: db.promises.length, incidents: db.incidents.length, flags: db.flags.length, sample: 14 },
      lastSync: { at: '2026-11-15T03:00:00.000Z', checked: 13, changed: 1 },
    }),
  runEval: () => wait(db.eval, 1800),
  openIssue: (key) => window.alert(`Preview mode: in Jira this opens ${key}.`),
  openUrl: (url) => void window.open(url, '_blank', 'noopener'),
};
