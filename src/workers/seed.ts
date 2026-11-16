import api, { route } from '@forge/api';
import { createIssue, createPage, findPageByTitle, getWorkItem, issueTypesFor } from '../platform/atlassian';
import { getSettings, state } from '../platform/settings';
import { ledger } from '../platform/sql';
import { loadSampleLedger, type SeedTargets } from '../seed/load';
import { SEED_PAGES, SEED_PROMISES, SEED_WORK_ITEMS } from '../seed/nimbusPay';
import type { WorkItem } from '../ledger/types';
import { guardWorkItem } from './guardService';

export interface SampleResult {
  decisions: number;
  promises: number;
  incidents: number;
  pagesCreated: number;
  issuesCreated: number;
  tryKeys: { slug: string; key: string; real: boolean }[];
  warnings: string[];
}

interface SampleState {
  issues: Record<string, string>;
  workItems: Record<string, string>;
}

async function closeIssue(key: string): Promise<void> {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/transitions`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return;
  const body = (await res.json()) as { transitions?: { id: string; to?: { statusCategory?: { key?: string } } }[] };
  const done = body.transitions?.find((t) => t.to?.statusCategory?.key === 'done');
  if (!done) return;
  await api.asApp().requestJira(route`/rest/api/3/issue/${key}/transitions`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ transition: { id: done.id } }),
  });
}

/**
 * Creates the Nimbus Pay demo world. Works on an empty site:
 * - always: fills the ledger (decisions, promises, incidents) and flags three example work items;
 * - with a space: also creates the real Confluence pages so "View source" opens them;
 * - with a project: also creates real Jira work items, so the issue panel shows live results.
 * Everything is best-effort: a failure in an optional step becomes a warning, never a dead end.
 */
export async function loadSampleWorld(opts: { projectKey?: string; spaceId?: string }): Promise<SampleResult> {
  const repo = await ledger();
  const settings = await getSettings();
  const warnings: string[] = [];
  const targets: SeedTargets = { pages: {}, issues: {} };
  const previous = (await state.get<SampleState>('sample')) ?? { issues: {}, workItems: {} };
  let pagesCreated = 0;
  let issuesCreated = 0;

  if (opts.spaceId) {
    const spaceId = opts.spaceId;
    // Created in parallel: a resolver has 25 seconds in total.
    await Promise.all(
      SEED_PAGES.map(async (page) => {
        try {
          const existing = await findPageByTitle(spaceId, page.title);
          const created = existing ?? (await createPage(spaceId, page.title, page.storage));
          if (!existing) pagesCreated++;
          (targets.pages as Record<string, { id: string; url: string }>)[page.slug] = created;
        } catch {
          warnings.push(`Could not create the page "${page.title}". The ledger still has its content.`);
        }
      }),
    );
  }

  let taskTypeId: string | null = null;
  if (opts.projectKey) {
    try {
      const types = (await issueTypesFor(opts.projectKey)).filter((t) => !t.subtask);
      taskTypeId = (types.find((t) => /^task$/i.test(t.name)) ?? types.find((t) => /story|bug/i.test(t.name)) ?? types[0])?.id ?? null;
      if (!taskTypeId) warnings.push(`Project ${opts.projectKey} has no usable work type.`);
    } catch {
      warnings.push(`Could not read project ${opts.projectKey}. Sample work items were not created.`);
    }
  }

  if (opts.projectKey && taskTypeId) {
    const projectKey = opts.projectKey;
    const typeId = taskTypeId;
    await Promise.all(
      SEED_PROMISES.filter((p) => p.issue).map(async (p) => {
        const known = previous.issues[p.key];
        if (known) {
          (targets.issues as Record<string, string>)[p.key] = known;
          return;
        }
        try {
          const key = await createIssue({
            projectKey,
            issueTypeId: typeId,
            summary: p.issue?.summary ?? p.statement,
            description: `Promised in the postmortem of ${p.origin}.\n${p.statement}\nOwner: ${p.owner}. Due ${p.due}.`,
            labels: ['precedent-sample'],
          });
          if (p.issue?.done) await closeIssue(key).catch(() => undefined);
          (targets.issues as Record<string, string>)[p.key] = key;
          issuesCreated++;
        } catch {
          warnings.push(`Could not create the tracking work item for ${p.key}.`);
        }
      }),
    );
  }

  const summary = await loadSampleLedger(repo, targets);

  const tryKeys: SampleResult['tryKeys'] = [];
  const workItems: Record<string, string> = { ...previous.workItems };
  for (const w of SEED_WORK_ITEMS) {
    let item: WorkItem = {
      key: w.fallbackKey,
      projectKey: w.fallbackKey.split('-')[0] ?? '',
      summary: w.summary,
      description: w.description,
      labels: [...w.labels],
      components: [],
      issueType: w.incident ? 'Incident' : 'Story',
      isIncident: w.incident,
    };
    let real = false;
    if (opts.projectKey && taskTypeId) {
      try {
        const key =
          workItems[w.slug] ??
          (await createIssue({
            projectKey: opts.projectKey,
            issueTypeId: taskTypeId,
            summary: w.summary,
            description: w.description,
            labels: [...w.labels, 'precedent-sample', ...(w.incident ? ['incident'] : [])],
          }));
        if (!workItems[w.slug]) issuesCreated++;
        workItems[w.slug] = key;
        const fetched = (await getWorkItem(key)).item;
        item = { ...fetched, isIncident: w.incident };
        real = true;
      } catch {
        warnings.push(`Could not create the example work item "${w.summary}".`);
      }
    }
    // The sample is judged without an LLM call so loading it is instant and free.
    await guardWorkItem(item, { repo, settings: { ...settings, postComments: false } });
    tryKeys.push({ slug: w.slug, key: item.key, real });
  }

  await state.set('sample', { issues: { ...previous.issues, ...targets.issues }, workItems } satisfies SampleState);
  return { ...summary, pagesCreated, issuesCreated, tryKeys, warnings };
}

export async function clearSampleWorld(): Promise<void> {
  const repo = await ledger();
  const prev = await state.get<SampleState>('sample');
  await repo.clearSample();
  for (const w of SEED_WORK_ITEMS) {
    const key = prev?.workItems[w.slug] ?? w.fallbackKey;
    await repo.replaceFlags(key, []);
    if (w.incident) await repo.deleteIncident(key);
  }
  await state.del('sample');
}
