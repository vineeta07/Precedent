import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { explainDecision } from '../ai/explain';
import { LifecycleError, supersedeChain } from '../ledger/rules';
import type { DecisionStatus, FeedbackVerdict, LedgerSettings, PromiseStatus } from '../ledger/types';
import { buildDecisionDetail, buildIncidentRows, buildPanelView, buildSummary, flagCards, type SourceVisibility } from '../ledger/views';
import { listPageIdsInSpace, listProjects, listSpaces, userCanSeeIssue, visiblePageIds } from '../platform/atlassian';
import { availableModels, forgeLlm, pickModel, sqlCache } from '../platform/llm';
import { getSettings, saveSettings, state } from '../platform/settings';
import { ledger } from '../platform/sql';
import { enqueueGuard, extractionQueue, syncPromises } from '../workers';
import { clearSampleWorld, loadSampleWorld } from '../workers/seed';
import { runEval } from '../ai/eval/run';

interface Ctx {
  accountId?: string;
  extension?: { type?: string; issue?: { key?: string }; content?: { id?: string } };
}

export class ApiError extends Error {
  constructor(
    public readonly code: 'forbidden' | 'not_found' | 'invalid' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

type Handler<P, R> = (payload: P, ctx: Ctx) => Promise<R>;

const resolver = new Resolver();

/** Every resolver returns { ok, data } or { ok:false, error } so the UI can render a real error state. */
function define<P, R>(name: string, handler: Handler<P, R>): void {
  resolver.define(name, async ({ payload, context }) => {
    try {
      return { ok: true as const, data: await handler((payload ?? {}) as P, context as Ctx) };
    } catch (err) {
      const known = err instanceof ApiError || err instanceof LifecycleError;
      if (!known) console.error(`[precedent] ${name} failed`, err);
      return {
        ok: false as const,
        error: {
          code: err instanceof ApiError ? err.code : err instanceof LifecycleError ? 'invalid' : 'failed',
          message: known ? (err as Error).message : 'Something went wrong on our side. Please try again.',
        },
      };
    }
  });
}

async function isAdmin(): Promise<boolean> {
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return false;
    const body = (await res.json()) as { permissions?: { ADMINISTER?: { havePermission?: boolean } } };
    return body.permissions?.ADMINISTER?.havePermission === true;
  } catch {
    return false;
  }
}

async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new ApiError('forbidden', 'Only Jira administrators can change Precedent settings.');
}

const actor = (ctx: Ctx) => ctx.accountId ?? null;
const requireString = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new ApiError('invalid', `${name} is required.`);
  return v.trim();
};

/** Hide quotes and links of Confluence sources the current user cannot open. */
async function visibilityFor(sourceIds: (string | null)[]): Promise<SourceVisibility> {
  const numeric = sourceIds.filter((id): id is string => Boolean(id) && /^\d+$/.test(id as string));
  const visible = numeric.length ? await visiblePageIds(numeric) : new Set<string>();
  return (type, id) => type !== 'confluence' || !id || !/^\d+$/.test(id) || visible.has(id);
}

/* -------------------------------------------------------------- issue panel */

define('panel.get', async (_p: unknown, ctx) => {
  const key = ctx.extension?.issue?.key;
  if (!key) throw new ApiError('invalid', 'This panel only works on a Jira work item.');
  if (!(await userCanSeeIssue(key))) throw new ApiError('forbidden', 'You do not have access to this work item.');
  const repo = await ledger();
  const flags = await repo.listFlags(key);
  const sources: (string | null)[] = [];
  for (const f of flags) {
    if (f.targetType === 'decision') sources.push((await repo.getDecision(f.targetId))?.sourceId ?? null);
    else if (f.targetType === 'promise') sources.push((await repo.getPromise(f.targetId))?.originId ?? null);
  }
  return buildPanelView(repo, key, await visibilityFor(sources));
});

define('panel.recheck', async (_p: unknown, ctx) => {
  const key = ctx.extension?.issue?.key;
  if (!key) throw new ApiError('invalid', 'No work item in context.');
  if (!(await userCanSeeIssue(key))) throw new ApiError('forbidden', 'You do not have access to this work item.');
  await enqueueGuard(key, 0, true);
  return { queued: true };
});

define('flag.feedback', async (p: { flagId?: string; verdict?: FeedbackVerdict; note?: string }, ctx) => {
  const flagId = requireString(p.flagId, 'flagId');
  const verdict = p.verdict;
  if (verdict !== 'still_applies' && verdict !== 'not_related' && verdict !== 'superseded') throw new ApiError('invalid', 'Unknown verdict.');
  const repo = await ledger();
  const flag = await repo.getFlag(flagId);
  if (!flag) throw new ApiError('not_found', 'This flag no longer exists.');
  if (!(await userCanSeeIssue(flag.workItemKey))) throw new ApiError('forbidden', 'You do not have access to this work item.');
  await repo.addFeedback(flagId, ctx.accountId ?? 'unknown', verdict, (p.note ?? '').slice(0, 1000));
  if (verdict === 'not_related') await repo.setFlagDismissed(flagId, true);
  if (flag.targetType === 'decision') {
    await repo.addHistory(
      flag.targetId,
      `feedback:${verdict}`,
      actor(ctx),
      verdict === 'still_applies' ? `Confirmed as still applying to ${flag.workItemKey}` : verdict === 'not_related' ? `Marked not related to ${flag.workItemKey}` : `Reported as changed from ${flag.workItemKey}`,
    );
  }
  return { dismissed: verdict === 'not_related' };
});

/* ------------------------------------------------------------------- ledger */

define('ledger.summary', async () => {
  const repo = await ledger();
  return { summary: await buildSummary(repo), settings: await getSettings(), isAdmin: await isAdmin() };
});

define('ledger.decisions', async (p: { status?: DecisionStatus | 'all'; search?: string; tag?: string }) => {
  const repo = await ledger();
  const decisions = await repo.listDecisions({ status: p.status, search: p.search?.slice(0, 100), tag: p.tag?.slice(0, 40) });
  const visible = await visibilityFor(decisions.map((d) => d.sourceId));
  return decisions.map((d) => (visible(d.sourceType, d.sourceId) ? { ...d, restricted: false } : { ...d, sourceSnippet: '', sourceUrl: null, restricted: true }));
});

define('ledger.decision', async (p: { id?: string }) => {
  const repo = await ledger();
  const detail = await buildDecisionDetail(repo, requireString(p.id, 'id'));
  if (!detail) throw new ApiError('not_found', 'Decision not found.');
  const visible = await visibilityFor([detail.decision.sourceId]);
  const restricted = !visible(detail.decision.sourceType, detail.decision.sourceId);
  return { ...detail, decision: restricted ? { ...detail.decision, sourceSnippet: '', sourceUrl: null } : detail.decision, restricted };
});

define('ledger.promises', async (p: { status?: PromiseStatus | 'all'; search?: string }) => {
  const repo = await ledger();
  return repo.listPromises({ status: p.status, search: p.search?.slice(0, 100) });
});

define('ledger.incidents', async () => buildIncidentRows(await ledger()));

define('ledger.flags', async () => {
  const repo = await ledger();
  const flags = await repo.listAllFlags(200);
  return flagCards(repo, flags);
});

define('decision.setStatus', async (p: { id?: string; status?: DecisionStatus; note?: string }, ctx) => {
  const repo = await ledger();
  if (p.status !== 'accepted' && p.status !== 'rejected' && p.status !== 'proposed') throw new ApiError('invalid', 'Use supersede to retire an accepted decision.');
  return repo.setDecisionStatus(requireString(p.id, 'id'), p.status, actor(ctx), p.note?.slice(0, 500));
});

define('decision.edit', async (p: { id?: string; title?: string; statement?: string; rationale?: string; scopeTags?: string[] }, ctx) => {
  const repo = await ledger();
  return repo.editDecision(
    requireString(p.id, 'id'),
    {
      title: p.title?.slice(0, 500),
      statement: p.statement?.slice(0, 1200),
      rationale: p.rationale?.slice(0, 2000),
      scopeTags: p.scopeTags?.slice(0, 10).map((t) => String(t).toLowerCase().slice(0, 40)),
    },
    actor(ctx),
  );
});

define('decision.supersede', async (p: { id?: string; title?: string; statement?: string; reason?: string; sourceUrl?: string }, ctx) => {
  const repo = await ledger();
  const old = await repo.getDecision(requireString(p.id, 'id'));
  if (!old) throw new ApiError('not_found', 'Decision not found.');
  const statement = requireString(p.statement, 'The new decision');
  const reason = requireString(p.reason, 'A reason');
  try {
    return await repo.supersede(
      old.id,
      {
        title: (p.title ?? '').trim() || statement.slice(0, 120),
        statement,
        rationale: reason,
        scopeTags: old.scopeTags,
        ownerAccountId: actor(ctx),
        decidedAt: new Date().toISOString().slice(0, 10),
        sourceType: 'manual',
        sourceId: `manual:${old.key}:${Date.now()}`,
        sourceUrl: p.sourceUrl?.slice(0, 1000) ?? old.sourceUrl,
        sourceSnippet: statement,
        confidence: 1,
      },
      actor(ctx),
      reason.slice(0, 500),
    );
  } catch (err) {
    throw new ApiError('invalid', err instanceof Error ? err.message : 'Could not supersede this decision.');
  }
});

define('decision.explain', async (p: { id?: string }) => {
  const repo = await ledger();
  const d = await repo.getDecision(requireString(p.id, 'id'));
  if (!d) throw new ApiError('not_found', 'Decision not found.');
  const all = await repo.listDecisions({ limit: 1000 });
  return explainDecision(d, supersedeChain(d, new Map(all.map((x) => [x.id, x]))), { llm: forgeLlm, cache: sqlCache(repo) });
});

define('promise.setStatus', async (p: { id?: string; status?: PromiseStatus }, ctx) => {
  const repo = await ledger();
  if (p.status !== 'open' && p.status !== 'kept' && p.status !== 'broken') throw new ApiError('invalid', 'Unknown status.');
  await repo.setPromiseStatus(requireString(p.id, 'id'), p.status, actor(ctx), 'Updated by hand');
  return repo.getPromise(requireString(p.id, 'id'));
});

define('promise.link', async (p: { id?: string; issueKey?: string }) => {
  const repo = await ledger();
  const key = requireString(p.issueKey, 'Work item key').toUpperCase();
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) throw new ApiError('invalid', 'That does not look like a work item key (for example PAY-123).');
  if (!(await userCanSeeIssue(key))) throw new ApiError('not_found', `${key} was not found, or you cannot see it.`);
  const id = requireString(p.id, 'id');
  await repo.linkPromiseIssue(id, key);
  await repo.addLink({ entityId: id, targetType: 'issue', targetId: key, relation: 'tracked_by' });
  return repo.getPromise(id);
});

/* ------------------------------------------------------------------- byline */

define('byline.get', async (_p: unknown, ctx) => {
  const pageId = ctx.extension?.content?.id;
  if (!pageId) throw new ApiError('invalid', 'No page in context.');
  const repo = await ledger();
  return {
    pageId,
    decisions: await repo.listDecisions({ sourceId: String(pageId) }),
    promises: await repo.listPromises({ originId: String(pageId) }),
  };
});

define('byline.rescan', async (_p: unknown, ctx) => {
  const pageId = ctx.extension?.content?.id;
  if (!pageId) throw new ApiError('invalid', 'No page in context.');
  await extractionQueue.push({ body: { kind: 'page', pageId: String(pageId) } });
  return { queued: true };
});

/* -------------------------------------------------------------------- admin */

define('admin.settings.save', async (p: Partial<LedgerSettings>) => {
  await requireAdmin();
  return saveSettings(p);
});

define('admin.options', async () => {
  await requireAdmin();
  const [spaces, projects] = await Promise.all([listSpaces('user').catch(() => []), listProjects('user').catch(() => [])]);
  return { spaces, projects };
});

interface ScanState {
  startedAt: string;
  total: number;
  jobIds: string[];
  spaces: string[];
}

define('admin.scan.start', async (p: { spaceIds?: string[] }) => {
  await requireAdmin();
  const spaceIds = (p.spaceIds ?? []).map(String).filter((s) => /^\d+$/.test(s)).slice(0, 25);
  if (!spaceIds.length) throw new ApiError('invalid', 'Choose at least one space to scan.');
  const pages: string[] = [];
  for (const id of spaceIds) pages.push(...(await listPageIdsInSpace(id, 250)).map((pg) => pg.id));
  const jobIds: string[] = [];
  for (let i = 0; i < pages.length; i += 50) {
    const res = await extractionQueue.push(pages.slice(i, i + 50).map((pageId) => ({ body: { kind: 'page', pageId } })));
    jobIds.push(res.jobId);
  }
  const scan: ScanState = { startedAt: new Date().toISOString(), total: pages.length, jobIds, spaces: spaceIds };
  await state.set('scan', scan);
  await saveSettings({ scanSpaces: spaceIds, onboarded: true });
  return { total: pages.length };
});

define('admin.scan.progress', async () => {
  const scan = await state.get<ScanState>('scan');
  const repo = await ledger();
  const counts = await repo.counts();
  if (!scan) return { running: false, total: 0, done: 0, failed: 0, counts };
  let done = 0;
  let failed = 0;
  let inProgress = 0;
  for (const jobId of scan.jobIds) {
    try {
      const s = await extractionQueue.getJob(jobId).getStats();
      done += s.success;
      failed += s.failed;
      inProgress += s.inProgress;
    } catch {
      // stats expire after a while; treat as finished
    }
  }
  const running = inProgress > 0;
  return { running, total: scan.total, done: running ? done : Math.max(done, scan.total - failed), failed, startedAt: scan.startedAt, counts };
});

define('admin.sample.load', async (p: { projectKey?: string; spaceId?: string }) => {
  await requireAdmin();
  const result = await loadSampleWorld({ projectKey: p.projectKey?.toUpperCase(), spaceId: p.spaceId });
  await saveSettings({ onboarded: true });
  return result;
});

define('admin.sample.clear', async () => {
  await requireAdmin();
  await clearSampleWorld();
  return { cleared: true };
});

define('admin.sync', async () => {
  await requireAdmin();
  return syncPromises();
});

define('admin.health', async () => {
  await requireAdmin();
  const repo = await ledger();
  const health: { sql: boolean; llm: boolean; models: string[]; small: string | null; large: string | null; counts: unknown; lastSync: unknown; llmError?: string } = {
    sql: true,
    llm: false,
    models: [],
    small: null,
    large: null,
    counts: await repo.counts(),
    lastSync: (await state.get('last-sync')) ?? null,
  };
  try {
    health.models = await availableModels();
    health.small = pickModel(health.models, 'small');
    health.large = pickModel(health.models, 'large');
    health.llm = health.models.length > 0;
  } catch (err) {
    health.llmError = err instanceof Error ? err.message : 'Forge LLMs are not available';
  }
  return health;
});

define('admin.eval', async (p: { limit?: number }) => {
  await requireAdmin();
  const repo = await ledger();
  return runEval({ llm: forgeLlm, cache: sqlCache(repo) }, Math.min(Math.max(Number(p.limit) || 12, 1), 60));
});

export const handler = resolver.getDefinitions();
