import type { RelationT } from '../schemas';

export interface EvalCase {
  id: string;
  expected: RelationT;
  note: string;
  decision: { statement: string; rationale: string; rejected: string[]; scope: string[]; status: 'accepted' | 'proposed' | 'superseded' };
  item: { summary: string; description: string; labels: string[] };
}

export interface EvalReport {
  judge: 'llm' | 'heuristic' | 'mixed';
  cases: number;
  /** Conflict class: of everything flagged as a conflict, how much really was. */
  precision: number;
  /** Conflict class: of all real conflicts, how many were caught. */
  recall: number;
  f1: number;
  /** Share of cases where the exact relation matched. */
  accuracy: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  failures: { id: string; expected: RelationT; got: RelationT; confidence: number; note: string }[];
}
