import { beforeEach, describe, expect, it } from 'vitest';
import type { DecisionInput, LedgerRepository } from '../../src/ledger/repository';
import { memoryLedger } from '../helpers/sqlite';

const decision = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  title: 'No Firebase',
  statement: 'We will not move authentication to Firebase.',
  rationale: 'Data residency',
  alternativesRejected: ['Firebase Auth'],
  scopeTags: ['auth'],
  sourceType: 'confluence',
  sourceId: '1001',
  sourceUrl: 'https://example.test/wiki/1001',
  sourceSnippet: 'We decided NOT to move authentication to Firebase.',
  confidence: 0.9,
  ...over,
});

describe('ledger repository (real migrations on SQLite)', () => {
  let repo: LedgerRepository;
  beforeEach(() => {
    repo = memoryLedger().repo;
  });

  it('assigns sequential keys and upserts by content', async () => {
    const a = await repo.upsertDecision(decision());
    const again = await repo.upsertDecision(decision({ title: 'No Firebase (edited title)' }));
    const b = await repo.upsertDecision(decision({ statement: 'We use PostgreSQL for the ledger.' }));
    expect(a.created).toBe(true);
    expect(a.decision.key).toBe('DEC-1');
    expect(again.created).toBe(false);
    expect(again.decision.id).toBe(a.decision.id);
    expect(again.decision.title).toBe('No Firebase (edited title)');
    expect(b.decision.key).toBe('DEC-2');
    expect((await repo.listDecisions()).length).toBe(2);
  });

  it('finds by key (case-insensitive) and filters by status, search and tag', async () => {
    await repo.upsertDecision(decision({ status: 'accepted' }));
    await repo.upsertDecision(decision({ statement: 'Kafka for events.', title: 'Kafka', scopeTags: ['events'] }));
    expect((await repo.getDecision('dec-1'))?.title).toBe('No Firebase');
    expect((await repo.listDecisions({ status: 'accepted' })).length).toBe(1);
    expect((await repo.listDecisions({ search: 'kafka' })).length).toBe(1);
    expect((await repo.listDecisions({ tag: 'auth' })).length).toBe(1);
    expect((await repo.listDecisions({ sourceId: '1001' })).length).toBe(2);
  });

  it('enforces the lifecycle and records history', async () => {
    const { decision: d } = await repo.upsertDecision(decision());
    await expect(repo.setDecisionStatus(d.id, 'superseded', 'u1')).rejects.toThrow();
    const accepted = await repo.setDecisionStatus(d.id, 'accepted', 'u1');
    expect(accepted.status).toBe('accepted');
    const kinds = (await repo.historyFor(d.id)).map((h) => h.kind);
    expect(kinds).toEqual(['created', 'status:accepted']);
  });

  it('supersede keeps the old decision and links the chain', async () => {
    const { decision: old } = await repo.upsertDecision(decision({ status: 'accepted' }));
    const { old: after, next } = await repo.supersede(old.id, decision({ statement: 'We move auth to a EU-hosted provider.', sourceId: 'manual:1' }), 'u1', 'New EU region available');
    expect(after.status).toBe('superseded');
    expect(after.supersededBy).toBe(next.id);
    expect(after.statement).toBe(old.statement);
    expect(next.status).toBe('accepted');
    await expect(repo.supersede(old.id, { existingId: next.id }, 'u1', 'again')).rejects.toThrow(/already superseded/);
    await expect(repo.supersede(next.id, { existingId: next.id }, 'u1', 'self')).rejects.toThrow(/itself/);
  });

  it('stores promises with keys, links and status changes', async () => {
    const { promise } = await repo.upsertPromise({ statement: 'Add alert', originType: 'jsm_pir', originId: 'INC-1', sourceSnippet: 'Action item: Add alert', dueDate: '2026-08-01' });
    expect(promise.key).toBe('PRM-1');
    expect((await repo.upsertPromise({ statement: 'Add alert', originType: 'jsm_pir', originId: 'INC-1', sourceSnippet: 'x' })).created).toBe(false);
    await repo.linkPromiseIssue(promise.id, 'pay-9');
    await repo.setPromiseStatus(promise.id, 'kept', null);
    const got = await repo.getPromise('PRM-1');
    expect(got?.linkedIssueKey).toBe('PAY-9');
    expect(got?.status).toBe('kept');
    expect((await repo.listPromises({ originId: 'INC-1', status: 'kept' })).length).toBe(1);
  });

  it('replaceFlags never resurrects a dismissed flag and never re-comments', async () => {
    const { decision: d } = await repo.upsertDecision(decision({ status: 'accepted' }));
    const input = { targetType: 'decision' as const, targetId: d.id, kind: 'conflict' as const, confidence: 0.9, explanation: 'x' };
    const [flag] = await repo.replaceFlags('pay-1', [input]);
    expect(flag?.workItemKey).toBe('PAY-1');
    await repo.markFlagCommented(flag?.id as string);
    const [second] = await repo.replaceFlags('PAY-1', [input]);
    expect(second?.commented).toBe(true);
    await repo.setFlagDismissed(second?.id as string, true);
    expect(await repo.replaceFlags('PAY-1', [input])).toEqual([]);
    expect((await repo.listFlags('PAY-1', true)).length).toBe(1);
  });

  it('tracks seen sections, caches llm output and counts feedback', async () => {
    expect(await repo.sectionSeen('1001', 'h1')).toBe(false);
    await repo.markSectionSeen('1001', 'h1');
    await repo.markSectionSeen('1001', 'h1');
    expect(await repo.sectionSeen('1001', 'h1')).toBe(true);
    await repo.cacheSet('k', 'v1');
    await repo.cacheSet('k', 'v2');
    expect(await repo.cacheGet('k')).toBe('v2');
    expect(await repo.cacheGet('missing')).toBeNull();
    await repo.addFeedback('f1', 'u1', 'still_applies');
    await repo.addFeedback('f1', 'u2', 'not_related');
    expect(await repo.feedbackStats()).toEqual({ still_applies: 1, not_related: 1, superseded: 0 });
  });

  it('clearSample removes only sample rows', async () => {
    await repo.upsertDecision(decision({ sample: true }));
    await repo.upsertDecision(decision({ statement: 'A real decision here.' }));
    await repo.upsertIncident({ key: 'INC-9', summary: 's', description: '', occurredAt: null, postmortemUrl: null, scopeTags: [] }, true);
    await repo.clearSample();
    const c = await repo.counts();
    expect(c.decisions).toBe(1);
    expect(c.incidents).toBe(0);
    expect(c.sample).toBe(0);
  });
});
