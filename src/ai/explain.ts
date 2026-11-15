import type { Decision } from '../ledger/types';
import { completeJson, type LlmCache, type LlmClient } from './client';
import { EXPLAIN_SYSTEM } from './prompts/explain';
import { Explanation, type ExplanationT } from './schemas';

export function decisionFacts(d: Decision, chain: Decision[]): string {
  return [
    `Key: ${d.key}`,
    `Title: ${d.title}`,
    `Statement: ${d.statement}`,
    `Status: ${d.status}`,
    d.rationale ? `Rationale: ${d.rationale}` : '',
    d.alternativesRejected.length ? `Rejected alternatives: ${d.alternativesRejected.join('; ')}` : '',
    `Owner: ${d.ownerName ?? 'not recorded'}`,
    `Decided: ${d.decidedAt ?? 'date not recorded'}`,
    `Source: ${d.sourceUrl ?? d.sourceType}`,
    `Source quote: "${d.sourceSnippet}"`,
    chain.length > 1 ? `Supersede chain: ${chain.map((c) => `${c.key} (${c.status})`).join(' → ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Template explanation: always available, always cited. */
export function templateExplanation(d: Decision, chain: Decision[]): ExplanationT {
  const cite = d.sourceUrl ? `[${d.key}](${d.sourceUrl})` : d.key;
  const parts = [
    `**${d.key} — ${d.title}** (${d.status}). ${d.statement}`,
    d.rationale ? `Why: ${d.rationale}` : '',
    d.alternativesRejected.length ? `Rejected: ${d.alternativesRejected.join('; ')}.` : '',
    `Owner: ${d.ownerName ?? 'not recorded'}${d.decidedAt ? `, decided ${d.decidedAt}` : ''}.`,
    d.status === 'superseded' ? `This decision no longer applies; see ${chain[chain.length - 1]?.key ?? 'its successor'}.` : '',
    `Source: ${cite} — "${d.sourceSnippet}"`,
  ];
  return { summary: parts.filter(Boolean).join('\n\n'), citations: [d.sourceUrl ?? d.key] };
}

export async function explainDecision(d: Decision, chain: Decision[], deps: { llm?: LlmClient | null; cache?: LlmCache }): Promise<ExplanationT> {
  const fallback = templateExplanation(d, chain);
  if (!deps.llm) return fallback;
  try {
    const res = await completeJson(deps.llm, Explanation, 'large', EXPLAIN_SYSTEM, decisionFacts(d, chain), deps.cache, 600);
    const cited = res.summary.includes(d.key) || (d.sourceUrl ? res.summary.includes(d.sourceUrl) : false);
    return cited ? res : { summary: `${res.summary}\n\nSource: ${fallback.citations[0]}`, citations: fallback.citations };
  } catch {
    return fallback;
  }
}
