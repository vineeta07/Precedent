import type { WorkItem } from '../../ledger/types';
import { judge, type JudgeDeps } from '../judge';
import type { RelationT } from '../schemas';
import { EVAL_CASES } from './cases';
import type { EvalCase, EvalReport } from './types';

export const FLAG_THRESHOLD = 0.55;

/** Runs one case through the same path the guard uses: superseded decisions never count, low confidence is ignored. */
export async function judgeCase(c: EvalCase, deps: JudgeDeps): Promise<{ got: RelationT; confidence: number; method: 'llm' | 'heuristic' }> {
  if (c.decision.status === 'superseded') return { got: 'unrelated', confidence: 1, method: 'heuristic' };
  const item: WorkItem = {
    key: `EVAL-${c.id}`,
    projectKey: 'EVAL',
    summary: c.item.summary,
    description: c.item.description,
    labels: c.item.labels,
    components: [],
    issueType: 'Story',
    isIncident: false,
  };
  const r = await judge(
    item,
    { key: `DEC-${c.id}`, kind: 'decision', statement: c.decision.statement, rationale: c.decision.rationale, rejected: c.decision.rejected, scope: c.decision.scope, snippet: c.decision.statement },
    deps,
  );
  const flagged = r.relation === 'conflict' && r.confidence < FLAG_THRESHOLD ? 'related' : r.relation;
  return { got: flagged, confidence: r.confidence, method: r.method };
}

export function score(results: { c: EvalCase; got: RelationT; confidence: number; method: 'llm' | 'heuristic' }[]): EvalReport {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let exact = 0;
  const failures: EvalReport['failures'] = [];
  for (const r of results) {
    const want = r.c.expected === 'conflict';
    const got = r.got === 'conflict';
    if (want && got) tp++;
    else if (!want && got) fp++;
    else if (want && !got) fn++;
    if (r.got === r.c.expected) exact++;
    else failures.push({ id: r.c.id, expected: r.c.expected, got: r.got, confidence: Math.round(r.confidence * 100) / 100, note: r.c.note });
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const methods = new Set(results.map((r) => r.method));
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    judge: methods.size > 1 ? 'mixed' : methods.has('llm') ? 'llm' : 'heuristic',
    cases: results.length,
    precision: round(precision),
    recall: round(recall),
    f1: round(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)),
    accuracy: round(results.length ? exact / results.length : 0),
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    failures,
  };
}

export async function runEval(deps: JudgeDeps, limit = EVAL_CASES.length, cases: EvalCase[] = EVAL_CASES): Promise<EvalReport> {
  const subset = cases.slice(0, limit);
  const results: { c: EvalCase; got: RelationT; confidence: number; method: 'llm' | 'heuristic' }[] = [];
  for (let i = 0; i < subset.length; i += 6) {
    const batch = await Promise.all(subset.slice(i, i + 6).map(async (c) => ({ c, ...(await judgeCase(c, deps)) })));
    results.push(...batch);
  }
  return score(results);
}
