import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { completeJson, extractJson, LlmOutputError, type LlmClient } from '../../src/ai/client';
import { extractSection, groundExtraction, heuristicExtract } from '../../src/ai/extract';
import { heuristicIncidentMatch, heuristicJudge, judge } from '../../src/ai/judge';
import { templateExplanation } from '../../src/ai/explain';
import { runEval } from '../../src/ai/eval/run';
import { pickModel } from '../../src/ai/models';
import type { Decision, WorkItem } from '../../src/ledger/types';

const scripted = (...replies: string[]): LlmClient & { calls: number } => {
  const client = {
    calls: 0,
    async complete() {
      const r = replies[Math.min(client.calls, replies.length - 1)] as string;
      client.calls++;
      return r;
    },
  };
  return client;
};

const item = (summary: string, description = ''): WorkItem => ({ key: 'PAY-1', projectKey: 'PAY', summary, description, labels: [], components: [], issueType: 'Story', isIncident: false });

describe('strict JSON output', () => {
  const schema = z.object({ n: z.number() });
  it('parses fenced JSON and prose around it', () => {
    expect(extractJson('Sure!\n```json\n{"n":1}\n```')).toEqual({ n: 1 });
    expect(() => extractJson('no json here')).toThrow(LlmOutputError);
  });
  it('retries once on bad output, then succeeds', async () => {
    const llm = scripted('not json', '{"n": 2}');
    expect(await completeJson(llm, schema, 'small', 's', 'u')).toEqual({ n: 2 });
    expect(llm.calls).toBe(2);
  });
  it('fails after the second bad output', async () => {
    const llm = scripted('{"n":"x"}', '{"n":"y"}');
    await expect(completeJson(llm, schema, 'small', 's', 'u')).rejects.toThrow(LlmOutputError);
    expect(llm.calls).toBe(2);
  });
  it('caches by content hash so the same prompt is billed once', async () => {
    const store = new Map<string, string>();
    const cache = { get: async (h: string) => store.get(h) ?? null, set: async (h: string, v: string) => void store.set(h, v) };
    const llm = scripted('{"n": 3}');
    await completeJson(llm, schema, 'small', 's', 'u', cache);
    await completeJson(llm, schema, 'small', 's', 'u', cache);
    expect(llm.calls).toBe(1);
    await completeJson(llm, schema, 'small', 's', 'different', cache);
    expect(llm.calls).toBe(2);
  });
});

describe('extraction never invents', () => {
  const text = 'We decided NOT to move authentication to Firebase.\nAction item: Add an alert on pool saturation. Owner: Tom Becker. Due 2026-08-08. PAY-77';
  it('drops items whose quote is not in the source or that are low confidence', () => {
    const out = groundExtraction(
      {
        decisions: [
          { title: 'real', statement: 'No Firebase auth.', rationale: '', alternatives_rejected: [], scope_tags: [], owner_name: null, decided_at: null, status: 'accepted', quote: 'We decided NOT to move authentication to Firebase.', confidence: 0.9 },
          { title: 'invented', statement: 'We will use Okta.', rationale: '', alternatives_rejected: [], scope_tags: [], owner_name: null, decided_at: null, status: 'accepted', quote: 'We decided to use Okta for everything.', confidence: 0.95 },
          { title: 'unsure', statement: 'No Firebase auth.', rationale: '', alternatives_rejected: [], scope_tags: [], owner_name: null, decided_at: null, status: 'accepted', quote: 'We decided NOT to move authentication to Firebase.', confidence: 0.4 },
        ],
        promises: [],
      },
      text,
    );
    expect(out.decisions.map((d) => d.title)).toEqual(['real']);
  });
  it('rule-based fallback returns verbatim lines with owner, date and key', () => {
    const out = heuristicExtract({ sourceTitle: 't', sourceDate: '2026-03-12', heading: '', text });
    expect(out.decisions).toHaveLength(1);
    expect(out.decisions[0]?.decided_at).toBe('2026-03-12');
    expect(out.promises[0]).toMatchObject({ owner_name: 'Tom Becker', due_date: '2026-08-08', linked_issue_key: 'PAY-77' });
  });
  it('uses the LLM when present and falls back when it fails', async () => {
    const good = scripted(JSON.stringify({ decisions: [], promises: [{ statement: 'Add an alert.', quote: 'Action item: Add an alert on pool saturation.', confidence: 0.9 }] }));
    const a = await extractSection({ sourceTitle: 't', sourceDate: null, heading: '', text }, { llm: good });
    expect(a.method).toBe('llm');
    expect(a.promises).toHaveLength(1);
    const b = await extractSection({ sourceTitle: 't', sourceDate: null, heading: '', text }, { llm: scripted('garbage') });
    expect(b.method).toBe('heuristic');
    expect(b.decisions).toHaveLength(1);
  });
});

describe('judge', () => {
  const firebase = { statement: 'We will not move customer authentication to Firebase Auth.', rationale: 'Data residency', rejected: ['Firebase Auth'], scope: ['auth'] };
  it('flags adoption of a rejected option and not its removal', () => {
    expect(heuristicJudge({ item: item('Migrate login to Firebase Auth'), ...firebase }).relation).toBe('conflict');
    expect(heuristicJudge({ item: item('Remove the Firebase Auth SDK'), ...firebase }).relation).toBe('related');
    expect(heuristicJudge({ item: item('Fix flaky fee calculator test'), ...firebase }).relation).toBe('unrelated');
    expect(heuristicJudge({ item: item('Revisit the decision about Firebase Auth'), ...firebase }).relation).toBe('revisits');
  });
  it('quotes the decision in its explanation', () => {
    const r = heuristicJudge({ item: item('Migrate login to Firebase Auth'), ...firebase });
    expect(r.explanation).toContain('"We will not move customer authentication to Firebase Auth."');
  });
  it('caps confidence when the LLM cites a quote that is not in the decision', async () => {
    const target = { key: 'DEC-1', kind: 'decision' as const, ...firebase, snippet: firebase.statement };
    const lying = scripted(JSON.stringify({ relation: 'conflict', confidence: 0.97, explanation: 'Because "all clouds are banned".', quote: 'all clouds are banned forever' }));
    expect((await judge(item('Use GCP'), target, { llm: lying })).confidence).toBeLessThanOrEqual(0.6);
    const honest = scripted(JSON.stringify({ relation: 'conflict', confidence: 0.93, explanation: 'It goes against "will not move customer authentication to Firebase Auth".', quote: 'will not move customer authentication to Firebase Auth' }));
    const r = await judge(item('Move login to Firebase'), target, { llm: honest });
    expect(r.confidence).toBe(0.93);
    expect(r.method).toBe('llm');
  });
  it('falls back to the deterministic judge when the LLM breaks', async () => {
    const broken: LlmClient = { complete: async () => { throw new Error('rate limited'); } };
    const r = await judge(item('Migrate login to Firebase Auth'), { key: 'DEC-1', kind: 'decision', ...firebase, snippet: '' }, { llm: broken });
    expect(r.method).toBe('heuristic');
    expect(r.relation).toBe('conflict');
  });
  it('matches incidents by failure mode', () => {
    const past = { key: 'INC-214', summary: 'Checkout payment timeouts', description: 'acquirer gateway slow, connection pool exhausted', occurredAt: null, postmortemUrl: null, scopeTags: ['checkout'] };
    expect(heuristicIncidentMatch({ summary: 'Checkout timing out for card payments', description: 'acquirer gateway slow and the connection pool is exhausted' }, past).similar).toBe(true);
    expect(heuristicIncidentMatch({ summary: 'Login outage after certificate expiry', description: 'TLS certificate expired' }, past).similar).toBe(false);
  });
});

describe('explanations and models', () => {
  it('template explanation always cites the source', () => {
    const d = { key: 'DEC-12', title: 'No Firebase', statement: 'S.', status: 'accepted', rationale: 'R', alternativesRejected: ['Firebase'], ownerName: 'Priya', decidedAt: '2026-03-12', sourceUrl: 'https://x.test/p', sourceSnippet: 'quote' } as Decision;
    const e = templateExplanation(d, [d]);
    expect(e.summary).toContain('[DEC-12](https://x.test/p)');
    expect(e.summary).toContain('"quote"');
  });
  it('picks a small model for the small tier and a larger one for explanations', () => {
    const models = ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-1'];
    expect(pickModel(models, 'small')).toBe('claude-haiku-4-5');
    expect(pickModel(models, 'large')).toBe('claude-sonnet-4-5');
    expect(pickModel([], 'small')).toBeNull();
  });
});

describe('eval set', () => {
  it('has 40+ cases and the offline judge stays above the precision bar', async () => {
    const report = await runEval({ llm: null });
    expect(report.cases).toBeGreaterThanOrEqual(40);
    expect(report.precision).toBeGreaterThanOrEqual(0.85);
    expect(report.recall).toBeGreaterThanOrEqual(0.7);
  });
});
