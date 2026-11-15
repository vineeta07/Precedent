import Resolver from '@forge/resolver';
import { Queue } from '@forge/events';
import { contextGraph } from '../graph';
import { adfToText } from '../ledger/sections';
import { derivePromiseStatus, shouldRunGuard, DEBOUNCE_SECONDS } from '../ledger/rules';
import { sha256 } from '../ledger/text';
import { addComment, findUserAccountId, getPage, getWorkItem, searchIssues, siteBaseUrl } from '../platform/atlassian';
import { forgeLlm, sqlCache } from '../platform/llm';
import { HttpError } from '../platform/retry';
import { getSettings, state } from '../platform/settings';
import { ledger } from '../platform/sql';
import { processDocument, type SourceDocument } from './extractionService';
import { guardWorkItem } from './guardService';

export const EXTRACTION_QUEUE = 'precedent-extraction';
export const GUARD_QUEUE = 'precedent-guard';

export const extractionQueue = new Queue({ key: EXTRACTION_QUEUE });
export const guardQueue = new Queue({ key: GUARD_QUEUE });

export type ExtractionJob =
  | { kind: 'page'; pageId: string }
  | { kind: 'comment'; issueKey: string; commentId: string; text: string; created: string | null };

export interface GuardJob {
  issueKey: string;
  ts: number;
  force?: boolean;
}

/* ----------------------------------------------------------------- triggers */

interface IssueEvent {
  issue?: { key?: string; fields?: { project?: { key?: string } } };
  comment?: { id?: string; body?: unknown; created?: string };
  changelog?: { items?: { field?: string }[] };
}

const GUARDED_FIELDS = new Set(['summary', 'description', 'labels', 'Component', 'components', 'issuetype']);
const WORTH_READING = /\b(we (have )?decided|decision|we will not|we won't|agreed|action item|follow[- ]?up|we will|owner:|going forward)\b/i;

export async function enqueueGuard(issueKey: string, delaySeconds: number, force = false): Promise<void> {
  const ts = Date.now();
  await state.set(`guard-latest:${issueKey}`, ts);
  await guardQueue.push({ body: { issueKey, ts, force }, delayInSeconds: delaySeconds });
}

export async function onIssueEvent(event: IssueEvent & { eventType?: string }): Promise<void> {
  const key = event.issue?.key;
  if (!key) return;
  const settings = await getSettings();
  const project = event.issue?.fields?.project?.key ?? key.split('-')[0] ?? '';
  if (settings.guardProjects.length > 0 && !settings.guardProjects.includes(project.toUpperCase())) return;

  if (event.eventType === 'avi:jira:commented:issue') {
    const text = adfToText(event.comment?.body).trim();
    if (event.comment?.id && text.length > 40 && WORTH_READING.test(text)) {
      await extractionQueue.push({
        body: { kind: 'comment', issueKey: key, commentId: event.comment.id, text, created: event.comment.created ?? null },
      });
    }
    return;
  }
  if (event.eventType === 'avi:jira:updated:issue') {
    const fields = (event.changelog?.items ?? []).map((i) => i.field ?? '');
    // Status changes, comments and rank moves do not change what the item proposes.
    if (fields.length > 0 && !fields.some((f) => GUARDED_FIELDS.has(f))) return;
    await enqueueGuard(key, DEBOUNCE_SECONDS);
    return;
  }
  await enqueueGuard(key, 5);
}

interface PageEvent {
  content?: { id?: string; type?: string; space?: { key?: string; id?: string | number } };
}

export async function onPageEvent(event: PageEvent): Promise<void> {
  const id = event.content?.id;
  if (!id) return;
  const settings = await getSettings();
  const space = String(event.content?.space?.id ?? '');
  const spaceKey = event.content?.space?.key ?? '';
  if (settings.scanSpaces.length > 0 && !settings.scanSpaces.includes(space) && !settings.scanSpaces.includes(spaceKey)) return;
  // Pages are often saved several times in a row; give the author a moment.
  await extractionQueue.push({ body: { kind: 'page', pageId: String(id) }, delayInSeconds: 30 });
}

/* ---------------------------------------------------------------- consumers */

const isGone = (err: unknown) => err instanceof HttpError && (err.status === 404 || err.status === 403);

export async function runExtraction(job: ExtractionJob) {
  const repo = await ledger();
  let doc: SourceDocument;
  if (job.kind === 'page') {
    const page = await getPage(job.pageId);
    doc = {
      id: page.id,
      type: 'confluence',
      title: page.title,
      url: page.url || null,
      date: page.createdAt ? page.createdAt.slice(0, 10) : null,
      body: page.body,
      format: 'storage',
    };
  } else {
    const base = await siteBaseUrl();
    doc = {
      id: `${job.issueKey}:${job.commentId}`,
      type: 'jira_comment',
      title: `Comment on ${job.issueKey}`,
      url: base ? `${base}/browse/${job.issueKey}?focusedCommentId=${job.commentId}` : null,
      date: job.created ? job.created.slice(0, 10) : null,
      body: job.text,
      format: 'plain',
    };
  }
  return processDocument(doc, { repo, llm: forgeLlm, cache: sqlCache(repo), resolveOwner: findUserAccountId });
}

export async function runGuard(job: GuardJob) {
  const latest = (await state.get<number>(`guard-latest:${job.issueKey}`)) ?? null;
  if (!job.force && latest !== null && job.ts < latest) return { skipped: 'debounced' as const };
  const { item } = await getWorkItem(job.issueKey);
  const contentHash = sha256([item.summary, item.description, item.labels.join(','), item.components.join(','), item.issueType].join('|'));
  const lastHash = (await state.get<string>(`guard-hash:${job.issueKey}`)) ?? null;
  if (!job.force && !shouldRunGuard(job.ts, latest, lastHash, contentHash)) return { skipped: 'unchanged' as const };
  const repo = await ledger();
  const settings = await getSettings();
  const graph = contextGraph(settings.useTeamworkGraph);
  const outcome = await guardWorkItem(item, {
    repo,
    settings,
    llm: forgeLlm,
    cache: sqlCache(repo),
    neighbours: (k) => graph.neighbours(k),
    comment: settings.postComments ? (k, text) => addComment(k, text) : undefined,
  });
  await state.set(`guard-hash:${job.issueKey}`, contentHash);
  return outcome;
}

const consumers = new Resolver();

consumers.define('extract', async ({ payload }) => {
  try {
    await runExtraction(payload as ExtractionJob);
  } catch (err) {
    if (isGone(err)) return; // deleted or restricted source: nothing to do, do not retry
    throw err;
  }
});

consumers.define('guard', async ({ payload }) => {
  try {
    await runGuard(payload as GuardJob);
  } catch (err) {
    if (isGone(err)) return;
    throw err;
  }
});

export const consumerHandler = consumers.getDefinitions();

/* ------------------------------------------------------------- promise sync */

export interface SyncOutcome {
  checked: number;
  changed: number;
}

/** Daily: pull the live status of every linked Jira issue and re-derive each promise's status. */
export async function syncPromises(): Promise<SyncOutcome> {
  const repo = await ledger();
  const promises = (await repo.listPromises({ limit: 1000 })).filter((p) => p.originType !== 'sample' || p.linkedIssueKey);
  const linkedKeys = [...new Set(promises.map((p) => p.linkedIssueKey).filter((k): k is string => Boolean(k)))];
  const states = new Map<string, { statusCategory: string; resolution: string | null; dueDate: string | null }>();
  for (let i = 0; i < linkedKeys.length; i += 50) {
    const batch = linkedKeys.slice(i, i + 50);
    try {
      const issues = await searchIssues(`key in (${batch.map((k) => `"${k}"`).join(',')})`, ['status', 'resolution', 'duedate'], 50);
      for (const issue of issues) {
        states.set(issue.key.toUpperCase(), {
          statusCategory: issue.fields.status?.statusCategory?.key ?? 'new',
          resolution: issue.fields.resolution?.name ?? null,
          dueDate: issue.fields.duedate ?? null,
        });
      }
    } catch {
      // A deleted issue in the batch must not stop the sync; the remaining promises keep their status.
    }
  }
  let changed = 0;
  for (const p of promises) {
    const linked = p.linkedIssueKey ? states.get(p.linkedIssueKey.toUpperCase()) ?? null : null;
    const effective = { dueDate: p.dueDate ?? linked?.dueDate ?? null, status: p.status };
    const next = derivePromiseStatus(effective, linked);
    if (next !== p.status) {
      await repo.setPromiseStatus(p.id, next, null, linked ? `Synced from ${p.linkedIssueKey}` : 'Due date passed');
      changed++;
    }
  }
  await state.set('last-sync', { at: new Date().toISOString(), checked: promises.length, changed });
  return { checked: promises.length, changed };
}

export async function dailySync(): Promise<void> {
  await syncPromises();
}
