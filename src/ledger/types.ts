/**
 * Core domain types for the Precedent ledger.
 * Everything here is plain data so it can be shared by workers, resolvers,
 * Rovo actions and tests without touching any Forge runtime API.
 */

export type DecisionStatus = 'proposed' | 'accepted' | 'superseded' | 'rejected';
export type PromiseStatus = 'open' | 'kept' | 'broken' | 'overdue';
export type SourceType = 'confluence' | 'jira_comment' | 'jsm_pir' | 'manual' | 'sample';
export type FlagKind = 'conflict' | 'deja_vu' | 'open_promise' | 'revisits';
export type TargetType = 'decision' | 'promise' | 'incident';
export type FeedbackVerdict = 'still_applies' | 'not_related' | 'superseded';

export interface Decision {
  id: string;
  key: string;
  title: string;
  statement: string;
  rationale: string;
  alternativesRejected: string[];
  scopeTags: string[];
  ownerAccountId: string | null;
  ownerName: string | null;
  decidedAt: string | null;
  status: DecisionStatus;
  supersededBy: string | null;
  sourceType: SourceType;
  sourceId: string | null;
  sourceUrl: string | null;
  sourceSnippet: string;
  contentHash: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface Commitment {
  id: string;
  key: string;
  statement: string;
  originType: SourceType;
  originId: string | null;
  ownerAccountId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  linkedIssueKey: string | null;
  status: PromiseStatus;
  sourceUrl: string | null;
  sourceSnippet: string;
  scopeTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Incident {
  key: string;
  summary: string;
  description: string;
  occurredAt: string | null;
  postmortemUrl: string | null;
  scopeTags: string[];
}

export interface Flag {
  id: string;
  workItemKey: string;
  targetType: TargetType;
  targetId: string;
  kind: FlagKind;
  confidence: number;
  explanation: string;
  dismissed: boolean;
  commented: boolean;
  createdAt: string;
}

export interface Feedback {
  id: string;
  flagId: string;
  accountId: string;
  verdict: FeedbackVerdict;
  note: string;
  createdAt: string;
}

export interface Link {
  entityId: string;
  targetType: string;
  targetId: string;
  relation: string;
}

export interface HistoryEntry {
  id: string;
  entityId: string;
  kind: string;
  actorAccountId: string | null;
  detail: string;
  at: string;
}

/** A Jira work item or JSM incident as the guard sees it. */
export interface WorkItem {
  key: string;
  projectKey: string;
  summary: string;
  description: string;
  labels: string[];
  components: string[];
  issueType: string;
  isIncident: boolean;
  updated?: string;
}

export interface LedgerSettings {
  /** Flags below this confidence are never stored. */
  ignoreBelow: number;
  /** Flags at or above this confidence may also produce a Jira comment. */
  commentAbove: number;
  postComments: boolean;
  guardProjects: string[];
  scanSpaces: string[];
  onboarded: boolean;
  /** Try the Teamwork Graph (EAP) for context before falling back to REST. */
  useTeamworkGraph: boolean;
}

export const DEFAULT_SETTINGS: LedgerSettings = {
  ignoreBelow: 0.55,
  commentAbove: 0.8,
  postComments: false,
  guardProjects: [],
  scanSpaces: [],
  onboarded: false,
  useTeamworkGraph: false,
};
