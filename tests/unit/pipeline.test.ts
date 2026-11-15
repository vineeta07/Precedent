import { beforeEach, describe, expect, it } from 'vitest';
import type { LedgerRepository } from '../../src/ledger/repository';
import { retrieveCandidates } from '../../src/ledger/candidates';
import { DEFAULT_SETTINGS, type WorkItem } from '../../src/ledger/types';
import { buildDecisionDetail, buildIncidentRows, buildPanelView, buildSummary } from '../../src/ledger/views';
import { loadSampleLedger } from '../../src/seed/load';
import { SEED_PAGES, SEED_WORK_ITEMS } from '../../src/seed/nimbusPay';
import { detectIncident, processDocument } from '../../src/workers/extractionService';
import { guardWorkItem } from '../../src/workers/guardService';
import { sanitizeSettings } from '../../src/platform/settings';
import { memoryLedger } from '../helpers/sqlite';

const workItem = (slug: string): WorkItem => {
  const w = SEED_WORK_ITEMS.find((x) => x.slug === slug);
  if (!w) throw new Error('unknown slug');
  return { key: w.fallbackKey, projectKey: 'PAY', summary: w.summary, description: w.description, labels: [...w.labels], components: [], issueType: w.incident ? 'Incident' : 'Story', isIncident: w.incident };
};

describe('extraction worker', () => {
  let repo: LedgerRepository;
  beforeEach(() => {
    repo = memoryLedger().repo;
  });
  const postmortem = SEED_PAGES.find((p) => p.slug === 'pm-inc-214');
  const doc = { id: '2002', type: 'confluence' as const, title: postmortem?.title ?? '', url: 'https://x.test/wiki/2002', date: '2026-07-16', body: postmortem?.storage ?? '', format: 'storage' as const };

  it('detects the incident from a postmortem title', () => {
    expect(detectIncident(doc)).toBe('INC-214');
    expect(detectIncident({ ...doc, title: 'Team offsite notes' })).toBeNull();
  });

  it('extracts promises with owner, due date and exact quotes, and records the incident', async () => {
    const out = await processDocument(doc, { repo, resolveOwner: async (name) => (name === 'Tom Becker' ? { accountId: 'acc-tom', displayName: 'Tom Becker' } : null) });
    expect(out.incidentKey).toBe('INC-214');
    expect(out.promises).toBe(3);
    const promises = await repo.listPromises({ originId: 'INC-214' });
    expect(promises).toHaveLength(3);
    const tom = promises.find((p) => p.ownerName === 'Tom Becker');
    expect(tom?.ownerAccountId).toBe('acc-tom');
    expect(tom?.dueDate).toBe('2026-08-08');
    for (const p of promises) expect(postmortem?.storage).toContain(p.sourceSnippet.slice(0, 40));
    expect((await repo.getIncident('INC-214'))?.postmortemUrl).toBe('https://x.test/wiki/2002');
  });

  it('skips unchanged sections on a re-scan and only re-reads the edited one', async () => {
    await processDocument(doc, { repo });
    const second = await processDocument(doc, { repo });
    expect(second.skipped).toBe(second.sections);
    expect(second.promises).toBe(0);
    const edited = { ...doc, body: doc.body.replace('</ul>', '<li>Action item: Write a runbook for acquirer slowness. Owner: Aiko Tanaka.</li></ul>') };
    const third = await processDocument(edited, { repo });
    expect(third.skipped).toBe(third.sections - 1);
    expect(third.promises).toBe(1);
    expect(await repo.listPromises()).toHaveLength(4);
  });

  it('extracted decisions start as proposed until confirmed', async () => {
    const adr = SEED_PAGES.find((p) => p.slug === 'adr-012');
    await processDocument({ ...doc, id: '2003', title: adr?.title ?? '', body: adr?.storage ?? '' }, { repo });
    const decisions = await repo.listDecisions({ sourceId: '2003' });
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(decisions.every((d) => d.status === 'proposed')).toBe(true);
    expect(decisions.some((d) => /Firebase/.test(d.sourceSnippet))).toBe(true);
  });
});

describe('guard worker on the Nimbus Pay world', () => {
  let repo: LedgerRepository;
  beforeEach(async () => {
    repo = memoryLedger().repo;
    await loadSampleLedger(repo);
  });

  it('loads the sample idempotently with the story keys', async () => {
    await loadSampleLedger(repo);
    const c = await repo.counts();
    expect(c.decisions).toBe(14);
    expect(c.promises).toBe(13);
    expect((await repo.getDecision('DEC-12'))?.ownerName).toBe('Priya Raman');
    expect((await repo.getDecision('DEC-5'))?.status).toBe('superseded');
    expect((await repo.upsertDecision({ title: 'n', statement: 'A brand new decision.', sourceType: 'manual', sourceSnippet: 'x', confidence: 1 })).decision.key).toBe('DEC-20');
  });

  it('flags the Firebase story as a conflict with DEC-12, citing it', async () => {
    const out = await guardWorkItem(workItem('firebase'), { repo, settings: DEFAULT_SETTINGS });
    const view = await buildPanelView(repo, 'PAY-482');
    expect(view.verdict.text).toBe('Conflicts with 1 decision');
    const card = view.cards[0];
    expect(card?.target.key).toBe('DEC-12');
    expect(card?.target.ownerName).toBe('Priya Raman');
    expect(card?.target.snippet).toContain('NOT to move authentication to Firebase');
    expect(out.flags.every((f) => f.confidence >= 0.55)).toBe(true);
  });

  it('recognises the repeat incident and the two promises that were never done', async () => {
    await guardWorkItem(workItem('checkout-again'), { repo, settings: DEFAULT_SETTINGS });
    const view = await buildPanelView(repo, 'INC-231');
    expect(view.verdict.text).toBe('Looks like INC-214 — 2 promises still open');
    expect(view.cards.filter((c) => c.kind === 'open_promise').map((c) => c.target.key).sort()).toEqual(['PRM-32', 'PRM-33']);
    const rows = await buildIncidentRows(repo);
    expect(rows[0]?.incident.key).toBe('INC-214');
    expect(rows[0]?.recurrences[0]?.workItemKey).toBe('INC-231');
  });

  it('stays quiet on unrelated work', async () => {
    await guardWorkItem(workItem('clean'), { repo, settings: DEFAULT_SETTINGS });
    const view = await buildPanelView(repo, 'PAY-490');
    expect(view.cards).toEqual([]);
    expect(view.verdict.text).toBe('No precedents found');
  });

  it('never counts a superseded decision', async () => {
    const item: WorkItem = { key: 'PAY-500', projectKey: 'PAY', summary: 'Split the merchant dashboard into microservices per bounded context', description: '', labels: ['dashboard'], components: [], issueType: 'Story', isIncident: false };
    const candidates = retrieveCandidates(item, { decisions: await repo.listDecisions(), promises: [], incidents: [] });
    expect(candidates.some((c) => c.type === 'decision' && c.item.key === 'DEC-5')).toBe(false);
    await guardWorkItem(item, { repo, settings: DEFAULT_SETTINGS });
    expect((await buildPanelView(repo, 'PAY-500')).cards.some((c) => c.target.key === 'DEC-5')).toBe(false);
  });

  it('comments once for high-confidence flags when enabled, and never again', async () => {
    const comments: string[] = [];
    const deps = { repo, settings: { ...DEFAULT_SETTINGS, postComments: true, commentAbove: 0.7 }, comment: async (_k: string, text: string) => void comments.push(text) };
    const first = await guardWorkItem(workItem('firebase'), deps);
    const second = await guardWorkItem(workItem('firebase'), deps);
    expect(first.commented).toBe(true);
    expect(second.commented).toBe(false);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toContain('DEC-12');
  });

  it('a dismissed flag does not come back after the next edit', async () => {
    const out = await guardWorkItem(workItem('firebase'), { repo, settings: DEFAULT_SETTINGS });
    await repo.setFlagDismissed(out.flags[0]?.id as string, true);
    const again = await guardWorkItem(workItem('firebase'), { repo, settings: DEFAULT_SETTINGS });
    expect(again.flags).toEqual([]);
  });

  it('hides quotes of sources the user cannot see', async () => {
    const d = await repo.getDecision('DEC-12');
    await guardWorkItem(workItem('firebase'), { repo, settings: DEFAULT_SETTINGS });
    const view = await buildPanelView(repo, 'PAY-482', (_t, id) => id !== d?.sourceId);
    expect(view.cards[0]?.target.restricted).toBe(true);
    expect(view.cards[0]?.target.snippet).toBe('');
    expect(view.cards[0]?.target.sourceUrl).toBeNull();
  });

  it('builds the dashboard summary and decision detail', async () => {
    await guardWorkItem(workItem('firebase'), { repo, settings: DEFAULT_SETTINGS });
    await guardWorkItem(workItem('checkout-again'), { repo, settings: DEFAULT_SETTINGS });
    const s = await buildSummary(repo, new Date('2026-11-15T00:00:00Z'));
    expect(s.kpis.decisionsTracked).toBe(14);
    expect(s.kpis.promisesKept).toBe(7);
    expect(s.kpis.promisesBroken).toBe(2);
    expect(s.kpis.keepRate).toBe(63.6);
    expect(s.kpis.repeatIncidentsCaught).toBe(1);
    expect(s.kpis.conflictsCaught).toBe(1);
    expect(s.months).toHaveLength(8);
    expect(s.hasSample).toBe(true);
    const detail = await buildDecisionDetail(repo, 'DEC-14');
    expect(detail?.chain.map((d) => d.key)).toEqual(['DEC-5', 'DEC-14']);
    const dec12 = await buildDecisionDetail(repo, 'DEC-12');
    expect(dec12?.flaggedWork[0]?.workItemKey).toBe('PAY-482');
  });
});

describe('settings', () => {
  it('clamps thresholds and keeps comment threshold above the ignore threshold', () => {
    const s = sanitizeSettings({ ignoreBelow: 0.9, commentAbove: 0.5, guardProjects: [' pay ', ''], postComments: true }, DEFAULT_SETTINGS);
    expect(s.ignoreBelow).toBe(0.9);
    expect(s.commentAbove).toBe(0.9);
    expect(s.guardProjects).toEqual(['PAY']);
    expect(sanitizeSettings({ ignoreBelow: 'x' as unknown as number }, DEFAULT_SETTINGS).ignoreBelow).toBe(0.55);
  });
});
