import type { Commitment, Decision, DecisionStatus, FeedbackVerdict, LedgerSettings, PromiseStatus } from '@core/ledger/types';
import type { DashboardSummary, DecisionDetail, FlagCard, IncidentRow } from '@core/ledger/views';
import type { EvalReport } from '@core/ai/eval/types';

export type { Commitment, Decision, DecisionStatus, FeedbackVerdict, LedgerSettings, PromiseStatus, DashboardSummary, DecisionDetail, FlagCard, IncidentRow, EvalReport };

export type DecisionRow = Decision & { restricted: boolean };
export type DecisionDetailView = DecisionDetail & { restricted: boolean };

export interface SummaryResponse {
  summary: DashboardSummary;
  settings: LedgerSettings;
  isAdmin: boolean;
}

export interface Options {
  spaces: { id: string; key: string; name: string }[];
  projects: { id: string; key: string; name: string; projectTypeKey: string }[];
}

export interface ScanProgress {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  startedAt?: string;
  counts: { decisions: number; promises: number; incidents: number; flags: number; sample: number };
}

export interface SampleResult {
  decisions: number;
  promises: number;
  incidents: number;
  pagesCreated: number;
  issuesCreated: number;
  tryKeys: { slug: string; key: string; real: boolean }[];
  warnings: string[];
}

export interface Health {
  sql: boolean;
  llm: boolean;
  models: string[];
  small: string | null;
  large: string | null;
  counts: ScanProgress['counts'];
  lastSync: { at: string; checked: number; changed: number } | null;
  llmError?: string;
}

export interface Explanation {
  summary: string;
  citations: string[];
}

/** Every backend call the Custom UI makes. Implemented by Forge resolvers and by the local preview backend. */
export interface Api {
  readonly preview: boolean;
  summary(): Promise<SummaryResponse>;
  decisions(filter: { status?: DecisionStatus | 'all'; search?: string; tag?: string }): Promise<DecisionRow[]>;
  decision(id: string): Promise<DecisionDetailView>;
  promises(filter: { status?: PromiseStatus | 'all'; search?: string }): Promise<Commitment[]>;
  incidents(): Promise<IncidentRow[]>;
  flags(): Promise<FlagCard[]>;
  setDecisionStatus(id: string, status: DecisionStatus): Promise<Decision>;
  supersede(id: string, input: { statement: string; reason: string }): Promise<{ old: Decision; next: Decision }>;
  explain(id: string): Promise<Explanation>;
  setPromiseStatus(id: string, status: PromiseStatus): Promise<Commitment | null>;
  linkPromise(id: string, issueKey: string): Promise<Commitment | null>;
  feedback(flagId: string, verdict: FeedbackVerdict): Promise<{ dismissed: boolean }>;
  saveSettings(patch: Partial<LedgerSettings>): Promise<LedgerSettings>;
  options(): Promise<Options>;
  startScan(spaceIds: string[]): Promise<{ total: number }>;
  scanProgress(): Promise<ScanProgress>;
  loadSample(input: { projectKey?: string; spaceId?: string }): Promise<SampleResult>;
  clearSample(): Promise<{ cleared: boolean }>;
  sync(): Promise<{ checked: number; changed: number }>;
  health(): Promise<Health>;
  runEval(limit: number): Promise<EvalReport>;
  openIssue(key: string): void;
  openUrl(url: string): void;
}
