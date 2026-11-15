import api, { route } from '@forge/api';
import type { WorkItem } from '../ledger/types';
import { adfToText } from '../ledger/sections';
import { HttpError, withRetry } from './retry';

type Who = 'app' | 'user';
type ApiResponse = Awaited<ReturnType<ReturnType<typeof api.asApp>['requestJira']>>;
type RouteValue = ReturnType<typeof route>;

const client = (who: Who) => (who === 'user' ? api.asUser() : api.asApp());

async function readJson<T>(res: ApiResponse, what: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(res.status, `${what} failed with ${res.status}`, body.slice(0, 500));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function jira<T>(who: Who, path: RouteValue, what: string, init?: { method?: string; body?: unknown }): Promise<T> {
  return withRetry(async () => {
    const res = await client(who).requestJira(path, {
      method: init?.method ?? 'GET',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return readJson<T>(res, what);
  });
}

async function confluence<T>(who: Who, path: RouteValue, what: string, init?: { method?: string; body?: unknown }): Promise<T> {
  return withRetry(async () => {
    const res = await client(who).requestConfluence(path, {
      method: init?.method ?? 'GET',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return readJson<T>(res, what);
  });
}

/* ------------------------------------------------------------------ Jira */

interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    labels?: string[];
    components?: { name: string }[];
    issuetype?: { name: string };
    project?: { key: string; projectTypeKey?: string };
    updated?: string;
    status?: { name: string; statusCategory?: { key: string } };
    resolution?: { name: string } | null;
    duedate?: string | null;
    issuelinks?: { inwardIssue?: { key: string }; outwardIssue?: { key: string } }[];
    assignee?: { accountId: string } | null;
    reporter?: { accountId: string } | null;
    parent?: { key: string };
  };
}

const ISSUE_FIELDS =
  'summary,description,labels,components,issuetype,project,updated,status,resolution,duedate,issuelinks,assignee,reporter,parent';

export const isIncidentType = (issueType: string, projectType?: string) =>
  /incident|outage|problem/i.test(issueType) || (projectType === 'service_desk' && /incident/i.test(issueType));

export function toWorkItem(issue: JiraIssue): WorkItem {
  const f = issue.fields;
  const issueType = f.issuetype?.name ?? 'Task';
  return {
    key: issue.key,
    projectKey: f.project?.key ?? issue.key.split('-')[0] ?? '',
    summary: f.summary ?? '',
    description: adfToText(f.description).trim(),
    labels: f.labels ?? [],
    components: (f.components ?? []).map((c) => c.name),
    issueType,
    isIncident: isIncidentType(issueType, f.project?.projectTypeKey),
    updated: f.updated,
  };
}

export async function getIssue(key: string, who: Who = 'app'): Promise<JiraIssue> {
  return jira<JiraIssue>(who, route`/rest/api/3/issue/${key}?fields=${ISSUE_FIELDS}`, `Reading ${key}`);
}

export async function getWorkItem(key: string, who: Who = 'app'): Promise<{ item: WorkItem; issue: JiraIssue }> {
  const issue = await getIssue(key, who);
  return { item: toWorkItem(issue), issue };
}

/** Returns true when the current user may view the issue. Used to respect permissions in the UI. */
export async function userCanSeeIssue(key: string): Promise<boolean> {
  try {
    await jira('user', route`/rest/api/3/issue/${key}?fields=summary`, `Checking access to ${key}`);
    return true;
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 403 || err.status === 401)) return false;
    throw err;
  }
}

export async function searchIssues(jql: string, fields: string[], maxResults = 100): Promise<JiraIssue[]> {
  const res = await jira<{ issues: JiraIssue[] }>('app', route`/rest/api/3/search/jql`, 'Searching issues', {
    method: 'POST',
    body: { jql, fields, maxResults },
  });
  return res.issues ?? [];
}

export async function addComment(key: string, text: string, link?: { href: string; label: string }): Promise<void> {
  const content: unknown[] = [{ type: 'text', text }];
  if (link) {
    content.push({ type: 'text', text: ' ' });
    content.push({ type: 'text', text: link.label, marks: [{ type: 'link', attrs: { href: link.href } }] });
  }
  await jira('app', route`/rest/api/3/issue/${key}/comment`, `Commenting on ${key}`, {
    method: 'POST',
    body: { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content }] } },
  });
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export async function listProjects(whoAmI: Who = 'user'): Promise<ProjectSummary[]> {
  const res = await jira<{ values: ProjectSummary[] }>(whoAmI, route`/rest/api/3/project/search?maxResults=100&orderBy=name`, 'Listing projects');
  return res.values ?? [];
}

export async function issueTypesFor(projectKey: string): Promise<{ id: string; name: string; subtask: boolean }[]> {
  const res = await jira<{ issueTypes?: { id: string; name: string; subtask: boolean }[]; values?: { id: string; name: string; subtask: boolean }[] }>(
    'app',
    route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
    'Reading issue types',
  );
  return res.issueTypes ?? res.values ?? [];
}

export async function createIssue(input: { projectKey: string; issueTypeId: string; summary: string; description: string; labels?: string[] }): Promise<string> {
  const res = await jira<{ key: string }>('app', route`/rest/api/3/issue`, 'Creating issue', {
    method: 'POST',
    body: {
      fields: {
        project: { key: input.projectKey },
        issuetype: { id: input.issueTypeId },
        summary: input.summary,
        labels: input.labels ?? [],
        description: {
          type: 'doc',
          version: 1,
          content: input.description
            .split('\n')
            .filter(Boolean)
            .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
        },
      },
    },
  });
  return res.key;
}

export async function findUserAccountId(name: string): Promise<{ accountId: string; displayName: string } | null> {
  if (!name.trim()) return null;
  try {
    const users = await jira<{ accountId: string; displayName: string; accountType?: string }[]>(
      'app',
      route`/rest/api/3/user/search?query=${name}&maxResults=5`,
      'Finding user',
    );
    const humans = users.filter((u) => u.accountType !== 'app');
    const exact = humans.find((u) => u.displayName.toLowerCase() === name.toLowerCase());
    const best = exact ?? (humans.length === 1 ? humans[0] : undefined);
    return best ? { accountId: best.accountId, displayName: best.displayName } : null;
  } catch {
    return null;
  }
}

let cachedBase: string | null = null;
export async function siteBaseUrl(): Promise<string> {
  if (cachedBase) return cachedBase;
  try {
    const info = await jira<{ baseUrl: string }>('app', route`/rest/api/3/serverInfo`, 'Reading site info');
    cachedBase = info.baseUrl.replace(/\/$/, '');
  } catch {
    cachedBase = '';
  }
  return cachedBase;
}

/* ------------------------------------------------------------ Confluence */

export interface PageWithBody {
  id: string;
  title: string;
  spaceId: string;
  body: string;
  url: string;
  authorId: string | null;
  createdAt: string | null;
}

interface V2Page {
  id: string;
  title: string;
  spaceId: string;
  authorId?: string;
  createdAt?: string;
  version?: { createdAt?: string; authorId?: string };
  body?: { storage?: { value?: string } };
  _links?: { webui?: string; base?: string };
}

export async function getPage(pageId: string, whoAmI: Who = 'app'): Promise<PageWithBody> {
  const p = await confluence<V2Page>(whoAmI, route`/wiki/api/v2/pages/${pageId}?body-format=storage`, `Reading page ${pageId}`);
  const base = p._links?.base ?? ((await siteBaseUrl()) + '/wiki');
  return {
    id: p.id,
    title: p.title,
    spaceId: p.spaceId,
    body: p.body?.storage?.value ?? '',
    url: p._links?.webui ? base + p._links.webui : '',
    authorId: p.authorId ?? p.version?.authorId ?? null,
    createdAt: p.createdAt ?? p.version?.createdAt ?? null,
  };
}

export interface SpaceSummary {
  id: string;
  key: string;
  name: string;
}

export async function listSpaces(whoAmI: Who = 'user'): Promise<SpaceSummary[]> {
  const res = await confluence<{ results: SpaceSummary[] }>(whoAmI, route`/wiki/api/v2/spaces?limit=100&type=global`, 'Listing spaces');
  return res.results ?? [];
}

export async function listPageIdsInSpace(spaceId: string, max = 250): Promise<{ id: string; title: string }[]> {
  const out: { id: string; title: string }[] = [];
  let cursor: string | undefined;
  do {
    const res: { results: { id: string; title: string }[]; _links?: { next?: string } } = await confluence(
      'app',
      cursor ? route`/wiki/api/v2/spaces/${spaceId}/pages?limit=50&cursor=${cursor}` : route`/wiki/api/v2/spaces/${spaceId}/pages?limit=50`,
      'Listing pages',
    );
    out.push(...(res.results ?? []).map((r) => ({ id: r.id, title: r.title })));
    const next = res._links?.next;
    cursor = next ? new URLSearchParams(next.split('?')[1] ?? '').get('cursor') ?? undefined : undefined;
  } while (cursor && out.length < max);
  return out.slice(0, max);
}

/** Of the given page ids, return the ones the current user is allowed to see. */
export async function visiblePageIds(pageIds: string[]): Promise<Set<string>> {
  const visible = new Set<string>();
  const unique = [...new Set(pageIds.filter((id) => /^\d+$/.test(id)))];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50).join(',');
    try {
      const res = await confluence<{ results: { id: string }[] }>('user', route`/wiki/api/v2/pages?id=${batch}&limit=50`, 'Checking page access');
      for (const r of res.results ?? []) visible.add(r.id);
    } catch {
      // On any failure we stay conservative: the snippet is hidden, never leaked.
    }
  }
  return visible;
}

export async function createPage(spaceId: string, title: string, storage: string, parentId?: string): Promise<{ id: string; url: string }> {
  const p = await confluence<V2Page>('app', route`/wiki/api/v2/pages`, 'Creating page', {
    method: 'POST',
    body: { spaceId, status: 'current', title, parentId, body: { representation: 'storage', value: storage } },
  });
  const base = p._links?.base ?? ((await siteBaseUrl()) + '/wiki');
  return { id: p.id, url: p._links?.webui ? base + p._links.webui : '' };
}

export async function findPageByTitle(spaceId: string, title: string): Promise<{ id: string; url: string } | null> {
  const res = await confluence<{ results: V2Page[] }>('app', route`/wiki/api/v2/spaces/${spaceId}/pages?title=${title}&limit=1`, 'Finding page');
  const p = res.results?.[0];
  if (!p) return null;
  const base = p._links?.base ?? ((await siteBaseUrl()) + '/wiki');
  return { id: p.id, url: p._links?.webui ? base + p._links.webui : '' };
}
