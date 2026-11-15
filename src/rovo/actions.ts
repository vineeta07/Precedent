import { explainDecision as explain } from '../ai/explain';
import { decisionTarget, judge } from '../ai/judge';
import { retrieveCandidates } from '../ledger/candidates';
import { supersedeChain } from '../ledger/rules';
import type { Commitment, Decision, WorkItem } from '../ledger/types';
import { getWorkItem } from '../platform/atlassian';
import { forgeLlm, sqlCache } from '../platform/llm';
import { ledger } from '../platform/sql';

/**
 * Rovo agent actions. The same functions are exposed to external AI clients through the rovo:mcp module.
 * Every result carries the source link and quote, so the agent can always cite.
 */

interface ActionPayload {
  query?: string;
  proposal?: string;
  issueKey?: string;
  decisionKey?: string;
  owner?: string;
  status?: string;
  newStatement?: string;
  reason?: string;
  context?: { accountId?: string; jira?: { issueKey?: string } };
}

const cite = (d: Decision) => ({
  key: d.key,
  title: d.title,
  statement: d.statement,
  status: d.status,
  owner: d.ownerName ?? 'not recorded',
  decidedAt: d.decidedAt ?? 'not recorded',
  sourceUrl: d.sourceUrl ?? 'no link recorded',
  sourceQuote: d.sourceSnippet,
});

const citePromise = (p: Commitment) => ({
  key: p.key,
  statement: p.statement,
  status: p.status,
  owner: p.ownerName ?? 'not recorded',
  dueDate: p.dueDate ?? 'no due date',
  trackedBy: p.linkedIssueKey ?? 'not linked to a work item',
  madeAfter: p.originId ?? 'unknown',
  sourceUrl: p.sourceUrl ?? 'no link recorded',
  sourceQuote: p.sourceSnippet,
});

async function asWorkItem(payload: ActionPayload, text: string): Promise<WorkItem> {
  const key = payload.issueKey ?? payload.context?.jira?.issueKey;
  if (key) {
    try {
      return (await getWorkItem(key.toUpperCase(), 'user')).item;
    } catch {
      // fall through to free text
    }
  }
  return { key: 'PROPOSAL', projectKey: '', summary: text.slice(0, 200), description: text, labels: [], components: [], issueType: 'Proposal', isIncident: false };
}

export async function findPrecedents(payload: ActionPayload) {
  const text = (payload.query ?? '').trim();
  if (!text && !payload.issueKey) return { error: 'Tell me what to look for, or give a work item key.' };
  const repo = await ledger();
  const item = await asWorkItem(payload, text);
  const [decisions, promises, incidents] = await Promise.all([repo.listDecisions(), repo.listPromises(), repo.listIncidents()]);
  const candidates = retrieveCandidates({ ...item, isIncident: true }, { decisions, promises, incidents }, undefined, 8);
  if (candidates.length === 0) return { found: 0, message: 'No precedents found in the ledger for this.' };
  return {
    found: candidates.length,
    decisions: candidates.filter((c) => c.type === 'decision').map((c) => cite(c.item as Decision)),
    promises: candidates.filter((c) => c.type === 'promise').map((c) => citePromise(c.item as Commitment)),
    incidents: candidates
      .filter((c) => c.type === 'incident')
      .map((c) => {
        const inc = c.item as { key: string; summary: string; occurredAt: string | null; postmortemUrl: string | null };
        return {
          key: inc.key,
          summary: inc.summary,
          occurredAt: inc.occurredAt ?? 'unknown',
          postmortemUrl: inc.postmortemUrl ?? 'no link recorded',
          promisesStillOpen: promises.filter((p) => p.originId === inc.key && p.status !== 'kept').map(citePromise),
        };
      }),
  };
}

export async function checkConflict(payload: ActionPayload) {
  const text = (payload.proposal ?? payload.query ?? '').trim();
  if (!text && !payload.issueKey) return { error: 'Describe the proposal, or give a work item key.' };
  const repo = await ledger();
  const item = await asWorkItem(payload, text);
  const decisions = await repo.listDecisions();
  const candidates = retrieveCandidates(item, { decisions, promises: [], incidents: [] }, undefined, 6);
  const results = [];
  for (const c of candidates) {
    if (c.type !== 'decision') continue;
    const r = await judge(item, decisionTarget(c.item), { llm: forgeLlm, cache: sqlCache(repo) });
    if (r.relation === 'unrelated' || r.confidence < 0.55) continue;
    results.push({ relation: r.relation, confidence: Math.round(r.confidence * 100) / 100, why: r.explanation, decision: cite(c.item) });
  }
  const conflicts = results.filter((r) => r.relation === 'conflict');
  return {
    verdict: conflicts.length ? `Conflicts with ${conflicts.length} accepted decision(s)` : results.length ? 'No conflict, but related decisions exist' : 'No conflict found',
    results,
    note: 'Superseded decisions are never counted.',
  };
}

export async function listOpenPromises(payload: ActionPayload) {
  const repo = await ledger();
  const wanted = (payload.status ?? '').toLowerCase();
  const owner = (payload.owner ?? '').toLowerCase();
  const all = await repo.listPromises();
  const filtered = all
    .filter((p) => (wanted && ['open', 'overdue', 'broken', 'kept'].includes(wanted) ? p.status === wanted : p.status !== 'kept'))
    .filter((p) => !owner || (p.ownerName ?? '').toLowerCase().includes(owner))
    .slice(0, 25);
  return { count: filtered.length, promises: filtered.map(citePromise) };
}

export async function explainDecision(payload: ActionPayload) {
  const key = (payload.decisionKey ?? '').trim();
  if (!key) return { error: 'Give a decision key such as DEC-12.' };
  const repo = await ledger();
  const d = await repo.getDecision(key);
  if (!d) return { error: `${key} is not in the ledger.` };
  const all = await repo.listDecisions({ limit: 1000 });
  const chain = supersedeChain(d, new Map(all.map((x) => [x.id, x])));
  const explanation = await explain(d, chain, { llm: forgeLlm, cache: sqlCache(repo) });
  return { explanation: explanation.summary, decision: cite(d), chain: chain.map((c) => `${c.key} (${c.status})`) };
}

export async function supersedeDecision(payload: ActionPayload) {
  const key = (payload.decisionKey ?? '').trim();
  const statement = (payload.newStatement ?? '').trim();
  const reason = (payload.reason ?? '').trim();
  if (!key || !statement || !reason) return { error: 'I need the decision key, the new decision in one sentence, and the reason.' };
  const repo = await ledger();
  const old = await repo.getDecision(key);
  if (!old) return { error: `${key} is not in the ledger.` };
  try {
    const { next } = await repo.supersede(
      old.id,
      {
        title: statement.slice(0, 120),
        statement,
        rationale: reason,
        scopeTags: old.scopeTags,
        ownerAccountId: payload.context?.accountId ?? null,
        decidedAt: new Date().toISOString().slice(0, 10),
        sourceType: 'manual',
        sourceId: `manual:${old.key}:${Date.now()}`,
        sourceUrl: old.sourceUrl,
        sourceSnippet: statement,
        confidence: 1,
      },
      payload.context?.accountId ?? null,
      reason.slice(0, 500),
    );
    return { done: true, message: `${old.key} is now superseded by ${next.key}. The old decision is kept in the chain.`, newDecision: cite(next) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not supersede the decision.' };
  }
}
