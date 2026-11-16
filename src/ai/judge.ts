import type { Commitment, Decision, Incident, WorkItem } from '../ledger/types';
import { keywordSet, overlap, quoteAppearsIn, sharedTerms, tokenize } from '../ledger/text';
import { completeJson, type LlmCache, type LlmClient } from './client';
import { INCIDENT_SYSTEM, JUDGE_SYSTEM, incidentUser, judgeUser } from './prompts/judge';
import { IncidentMatch, JudgeResult, type IncidentMatchT, type JudgeResultT } from './schemas';

/* --------------------------------------------------------------- heuristics */

const NEGATION =
  /\b(will not|won't|wont|do not|don't|does not|must not|mustn't|shall not|should not|cannot|can't|never|no longer|not be|not to|decided against|rejected|we reject|ban(?:ned)?|forbid(?:den)?|prohibit(?:ed)?|avoid|instead of|rather than|not move|not use|not adopt)\b/i;
const ADOPT =
  /\b(migrat\w*|mov(?:e|es|ing)\b|switch\w*|adopt\w*|introduc\w*|integrat\w*|replac\w*|us(?:e|es|ing)\b|add\w*|enabl\w*|roll(?:ing)?[- ]out|port(?:ing)?\b|build\w*|implement\w*|stor(?:e|es|ing)\b|send\w*|rewrit\w*|onboard\w*|poc|prototyp\w*|trial\w*|spin(?:ning)? up|set(?:ting)? up|turn(?:ing)? on|bring\w*|go(?:ing)? with|evaluat\w*|launch\w*|start\w* using|ship\w*|deploy\w*|hos(?:t|ting)\b|creat\w*|publish\w*|expos\w*|allow\w*|re-?enabl\w*|keep\w*)\b/i;
const REMOVE =
  /\b(remov\w*|deprecat\w*|sunset\w*|delet\w*|decommission\w*|rip(?:ping)? out|drop\w*|phase[- ]?out|disabl\w*|block\w*|enforc\w*|audit\w*|document\w*|clean(?:ing)? up|retir\w*|get rid|offboard\w*|shut(?:ting)? down|turn(?:ing)? off|guard\w* against|prevent\w*|lint\w* against|alert\w* on)\b/i;
const REVISIT =
  /\b(revisit\w*|reconsider\w*|re-?evaluat\w*|re-?open\w*|re-?think\w*|spike:|should we\b|investigate whether|challenge\w*|question\w* (?:the|our) decision|is it time to)\b/i;

/** Words that describe actions or generic qualities: never enough on their own to prove a conflict. */
const GENERIC = new Set(
  tokenize(
    'move migrate use adopt switch introduce integrate build store keep allow service services system systems data platform app application ' +
      'team teams customer customers user users feature features api apis new old current existing production prod environment environments ' +
      'support supported supporting change changes improve improvement update updates update fix fixes bug bugs code we will not decided decision ' +
      'all any every always only own internal external default standard simple better faster quick quickly project our them across one two first ' +
      'run running release releases version versions request requests time times page pages config configuration setting settings',
  ),
);

function distinctive(terms: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const t of terms) if (!GENERIC.has(t) && t.length > 2) out.add(t);
  return out;
}

/** A term that looks like a product or acronym (DynamoDB, Auth0, SQS, PANs): one hit is strong evidence. */
function properTerms(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? []) {
    if (/[a-z0-9-][A-Z]|[A-Z]{2,}|\d/.test(w)) for (const t of tokenize(w)) out.add(t);
  }
  return out;
}

/**
 * Phrases the decision forbids: each rejected alternative, plus each negated clause
 * ("we will not *add new RabbitMQ queues*"). Exceptions ("except for incident fixes") are cut off.
 */
function forbiddenPhrases(statement: string, rejected: string[], scope: string[]): { terms: Set<string>; proper: Set<string> }[] {
  const scopeTerms = new Set(scope.flatMap((t) => tokenize(t)));
  const phrases: { terms: Set<string>; proper: Set<string> }[] = [];
  for (const alt of rejected) {
    const terms = distinctive(keywordSet(alt));
    if (terms.size) phrases.push({ terms, proper: properTerms(alt) });
  }
  for (const sentence of statement.split(/(?<=[.;!?])\s+/)) {
    const m = NEGATION.exec(sentence);
    if (!m) continue;
    const cut = (t: string) => t.split(/,?\s+(?:except|unless|other than)\b/i)[0] ?? t;
    const after = cut(sentence.slice(m.index + m[0].length));
    let terms = distinctive(keywordSet(after));
    let source = after;
    if (terms.size < 2) {
      source = cut(sentence);
      terms = distinctive(keywordSet(source));
    }
    // When explicit rejected options exist, scope words in the clause ("…for the payments ledger") are context, not the forbidden thing.
    if (rejected.length > 0) for (const t of scopeTerms) terms.delete(t);
    if (terms.size) phrases.push({ terms, proper: properTerms(source) });
  }
  return phrases;
}

/** Which forbidden phrase does the item propose? A product name is enough; otherwise most of the phrase must appear. */
function forbiddenHits(phrases: { terms: Set<string>; proper: Set<string> }[], itemTerms: Set<string>): string[] {
  const hits = new Set<string>();
  for (const ph of phrases) {
    const matched = [...ph.terms].filter((t) => itemTerms.has(t));
    if (matched.length === 0) continue;
    const strong = matched.some((t) => ph.proper.has(t));
    if (strong || matched.length / ph.terms.size >= 0.75) for (const t of matched) hits.add(t);
  }
  return [...hits];
}

function itemSentencesWith(item: string, terms: Set<string>): string[] {
  return item.split(/(?<=[.;!?\n])\s*/).filter((s) => {
    const k = keywordSet(s);
    for (const t of terms) if (k.has(t)) return true;
    return false;
  });
}

export interface HeuristicInput {
  item: Pick<WorkItem, 'key' | 'summary' | 'description' | 'labels' | 'components'>;
  statement: string;
  rationale: string;
  rejected: string[];
  scope: string[];
}

/**
 * Deterministic judge. Used when the LLM is unavailable and as the offline eval baseline.
 * It only claims a conflict when the item proposes something the decision explicitly forbids or rejected.
 * Conflicts phrased in entirely different words are left to the LLM judge.
 */
export function heuristicJudge(input: HeuristicInput): JudgeResultT {
  const itemText = [input.item.summary, input.item.description, input.item.labels.join(' '), input.item.components.join(' ')].join('\n');
  const itemTerms = keywordSet(itemText);
  const decisionTerms = keywordSet([input.statement, input.rationale, input.scope.join(' ')].join(' '));
  const hits = forbiddenHits(forbiddenPhrases(input.statement, input.rejected, input.scope), itemTerms);
  const ov = overlap(itemTerms, decisionTerms);
  const firstQuote = (input.statement.split(/(?<=[.;!?])\s+/).find((s) => NEGATION.test(s)) ?? input.statement).trim();

  if (REVISIT.test(itemText) && (hits.length > 0 || ov >= 0.3)) {
    return {
      relation: 'revisits',
      confidence: Math.min(0.85, 0.6 + 0.08 * hits.length),
      explanation: `This item re-opens an earlier decision: "${firstQuote}".`,
      quote: firstQuote,
    };
  }

  if (hits.length > 0) {
    const sentences = itemSentencesWith(itemText, new Set(hits));
    const summaryTerms = keywordSet(input.item.summary);
    // A summary like "Remove leftover Firebase Auth SDK" states the intent for the whole item.
    const summaryRemoves = REMOVE.test(input.item.summary) && hits.some((t) => summaryTerms.has(t));
    const compatible = summaryRemoves || (sentences.length > 0 && sentences.every((s) => REMOVE.test(s) || NEGATION.test(s)));
    if (!compatible) {
      const adopts = sentences.some((s) => ADOPT.test(s));
      const scopeHit = input.scope.some((s) => itemTerms.has(tokenize(s)[0] ?? '\u0000'));
      return {
        relation: 'conflict',
        confidence: Math.min(0.92, (adopts ? 0.7 : 0.6) + 0.06 * hits.length + (scopeHit ? 0.06 : 0)),
        explanation: `This work proposes something the team decided against: "${firstQuote}"`,
        quote: firstQuote,
      };
    }
    return {
      relation: 'related',
      confidence: 0.6,
      explanation: `Touches ${hits.slice(0, 3).join(', ')} in line with the decision "${firstQuote}".`,
      quote: firstQuote,
    };
  }

  const distinctShared = [...distinctive(sharedTerms(itemTerms, decisionTerms))];
  if (ov >= 0.34 && distinctShared.length >= 2) {
    return {
      relation: 'related',
      confidence: Math.min(0.75, 0.45 + ov / 2),
      explanation: `Same area as "${input.statement.trim()}" (${distinctShared.slice(0, 3).join(', ')}).`,
      quote: input.statement.trim(),
    };
  }
  return { relation: 'unrelated', confidence: 0.8, explanation: 'No meaningful overlap with this decision.', quote: '' };
}

/* --------------------------------------------------------------------- LLM */

export interface JudgeDeps {
  llm?: LlmClient | null;
  cache?: LlmCache;
}

export interface JudgeTarget {
  key: string;
  kind: 'decision' | 'promise';
  statement: string;
  rationale: string;
  rejected: string[];
  scope: string[];
  snippet: string;
}

export function decisionTarget(d: Decision): JudgeTarget {
  return {
    key: d.key,
    kind: 'decision',
    statement: d.statement,
    rationale: d.rationale,
    rejected: d.alternativesRejected,
    scope: d.scopeTags,
    snippet: d.sourceSnippet,
  };
}

export function promiseTarget(p: Commitment): JudgeTarget {
  return { key: p.key, kind: 'promise', statement: p.statement, rationale: '', rejected: [], scope: p.scopeTags, snippet: p.sourceSnippet };
}

/**
 * LLM judge with guard rails:
 * - the cited quote must exist in the decision text, otherwise confidence is capped;
 * - any LLM failure falls back to the deterministic judge (never throws into the worker).
 */
export async function judge(item: WorkItem, target: JudgeTarget, deps: JudgeDeps = {}): Promise<JudgeResultT & { method: 'llm' | 'heuristic' }> {
  const heuristic = heuristicJudge({
    item,
    statement: target.statement,
    rationale: target.rationale,
    rejected: target.rejected,
    scope: target.scope,
  });
  if (!deps.llm) return { ...heuristic, method: 'heuristic' };
  try {
    const res = await completeJson(
      deps.llm,
      JudgeResult,
      'small',
      JUDGE_SYSTEM,
      judgeUser({
        itemKey: item.key,
        itemSummary: item.summary,
        itemDescription: item.description,
        targetKey: target.key,
        targetKind: target.kind,
        targetStatement: target.statement,
        targetRationale: target.rationale,
        rejected: target.rejected,
        scope: target.scope,
      }),
      deps.cache,
      400,
    );
    const sourceText = [target.statement, target.rationale, target.rejected.join(' '), target.snippet].join(' ');
    const grounded = !res.quote || quoteAppearsIn(res.quote, sourceText);
    const confidence = grounded ? res.confidence : Math.min(res.confidence, 0.6);
    return { ...res, confidence, method: 'llm' };
  } catch {
    return { ...heuristic, method: 'heuristic' };
  }
}

export function heuristicIncidentMatch(item: Pick<WorkItem, 'summary' | 'description'>, past: Incident): IncidentMatchT {
  const a = distinctive(keywordSet(item.summary + ' ' + item.description));
  const b = distinctive(keywordSet(past.summary + ' ' + past.description + ' ' + past.scopeTags.join(' ')));
  const ov = overlap(a, b);
  const shared = sharedTerms(a, b);
  const similar = ov >= 0.3 && shared.length >= 2;
  return {
    similar,
    confidence: similar ? Math.min(0.9, 0.55 + ov / 2) : 0.7,
    explanation: similar
      ? `Same failure pattern as ${past.key} "${past.summary}" (${shared.slice(0, 3).join(', ')}).`
      : `Different failure mode from ${past.key}.`,
  };
}

export async function matchIncident(item: WorkItem, past: Incident, deps: JudgeDeps = {}): Promise<IncidentMatchT & { method: 'llm' | 'heuristic' }> {
  const fallback = heuristicIncidentMatch(item, past);
  if (!deps.llm) return { ...fallback, method: 'heuristic' };
  try {
    const res = await completeJson(
      deps.llm,
      IncidentMatch,
      'small',
      INCIDENT_SYSTEM,
      incidentUser({ key: item.key, summary: item.summary, description: item.description }, past),
      deps.cache,
      300,
    );
    return { ...res, method: 'llm' };
  } catch {
    return { ...fallback, method: 'heuristic' };
  }
}
