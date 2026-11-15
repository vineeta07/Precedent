import type { Commitment, Decision, Incident, WorkItem } from './types';
import { keywordSet, overlap, sharedTerms } from './text';

export interface GraphNeighbourhood {
  /** Keys of Jira work items linked to the item (issue links, epics, remote links). */
  linkedKeys: string[];
  /** Confluence page IDs linked or mentioned around the item. */
  pageIds: string[];
  /** Account IDs of people around the item (assignee, reporter, watchers). */
  people: string[];
}

export const EMPTY_NEIGHBOURHOOD: GraphNeighbourhood = { linkedKeys: [], pageIds: [], people: [] };

export type Candidate =
  | { type: 'decision'; item: Decision; score: number; reasons: string[] }
  | { type: 'promise'; item: Commitment; score: number; reasons: string[] }
  | { type: 'incident'; item: Incident; score: number; reasons: string[] };

export function workItemText(w: WorkItem): string {
  return [w.summary, w.description, w.labels.join(' '), w.components.join(' ')].join('\n');
}

function scopeMatch(scopeTags: string[], w: WorkItem): string[] {
  const wanted = new Set(
    [w.projectKey, ...w.labels, ...w.components].map((s) => s.toLowerCase()),
  );
  return scopeTags.filter((t) => wanted.has(t.toLowerCase()));
}

/**
 * Cheap, deterministic candidate retrieval. Nothing here calls an LLM.
 * Score = keyword overlap (0..1) + 0.25 per scope tag match + 0.3 if the graph links the item to the source.
 */
export function retrieveCandidates(
  w: WorkItem,
  ledger: { decisions: Decision[]; promises: Commitment[]; incidents: Incident[] },
  graph: GraphNeighbourhood = EMPTY_NEIGHBOURHOOD,
  limit = 15,
): Candidate[] {
  const itemTerms = keywordSet(workItemText(w));
  const linked = new Set(graph.linkedKeys.map((k) => k.toUpperCase()));
  const pages = new Set(graph.pageIds);
  const people = new Set(graph.people);
  const out: Candidate[] = [];

  for (const d of ledger.decisions) {
    if (d.status === 'superseded' || d.status === 'rejected') continue;
    const terms = keywordSet([d.title, d.statement, d.rationale, d.scopeTags.join(' '), d.alternativesRejected.join(' ')].join(' '));
    const kw = overlap(itemTerms, terms);
    const scope = scopeMatch(d.scopeTags, w);
    const reasons: string[] = [];
    let score = kw;
    if (kw > 0) reasons.push('shared terms: ' + sharedTerms(itemTerms, terms).slice(0, 5).join(', '));
    if (scope.length) {
      score += 0.25 * scope.length;
      reasons.push('scope: ' + scope.join(', '));
    }
    if (d.sourceId && pages.has(d.sourceId)) {
      score += 0.3;
      reasons.push('linked source page');
    }
    if (d.ownerAccountId && people.has(d.ownerAccountId)) {
      score += 0.1;
      reasons.push('owner is involved');
    }
    if (score >= 0.2) out.push({ type: 'decision', item: d, score, reasons });
  }

  for (const p of ledger.promises) {
    if (p.status === 'kept') continue;
    if (p.linkedIssueKey && p.linkedIssueKey.toUpperCase() === w.key.toUpperCase()) continue;
    const terms = keywordSet(p.statement + ' ' + p.scopeTags.join(' '));
    const kw = overlap(itemTerms, terms);
    const scope = scopeMatch(p.scopeTags, w);
    const reasons: string[] = [];
    let score = kw;
    if (kw > 0) reasons.push('shared terms: ' + sharedTerms(itemTerms, terms).slice(0, 5).join(', '));
    if (scope.length) {
      score += 0.25 * scope.length;
      reasons.push('scope: ' + scope.join(', '));
    }
    if (p.linkedIssueKey && linked.has(p.linkedIssueKey.toUpperCase())) {
      score += 0.3;
      reasons.push('linked to ' + p.linkedIssueKey);
    }
    if (score >= 0.25) out.push({ type: 'promise', item: p, score, reasons });
  }

  if (w.isIncident) {
    for (const inc of ledger.incidents) {
      if (inc.key.toUpperCase() === w.key.toUpperCase()) continue;
      const terms = keywordSet(inc.summary + ' ' + inc.description + ' ' + inc.scopeTags.join(' '));
      const kw = overlap(itemTerms, terms);
      const scope = scopeMatch(inc.scopeTags, w);
      let score = kw + 0.2 * scope.length;
      const reasons = kw > 0 ? ['shared terms: ' + sharedTerms(itemTerms, terms).slice(0, 5).join(', ')] : [];
      if (linked.has(inc.key.toUpperCase())) {
        score += 0.3;
        reasons.push('linked incident');
      }
      if (score >= 0.3) out.push({ type: 'incident', item: inc, score, reasons });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
