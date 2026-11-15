import api, { route } from '@forge/api';
import type { GraphNeighbourhood } from '../ledger/candidates';
import { EMPTY_NEIGHBOURHOOD } from '../ledger/candidates';
import { getIssue } from '../platform/atlassian';

/** Anything that can describe the people and work around a Jira item. */
export interface ContextGraph {
  readonly name: string;
  neighbours(issueKey: string): Promise<GraphNeighbourhood>;
}

/**
 * Teamwork Graph API (EAP). Uses api.asUser().requestTeamworkGraph with a Cypher query.
 * It only works in a user context and only on sites enrolled in the EAP, so any error
 * (including "no user in a queue consumer") makes the composite fall back to REST.
 */
export class TeamworkGraphProvider implements ContextGraph {
  readonly name = 'teamwork-graph';
  async neighbours(issueKey: string): Promise<GraphNeighbourhood> {
    const query = `query PrecedentNeighbours($cypherQuery: String!) {
      cypherQuery(query: $cypherQuery) { edges { node { columns { key value { __typename ... on CypherQueryResultNode { id } } } } } }
    }`;
    const safeKey = issueKey.replace(/[^A-Z0-9-]/gi, '');
    const cypher = `MATCH (i:JiraIssue {key: '${safeKey}'})-[r]-(n) RETURN n LIMIT 50`;
    const res = await api.asUser().requestTeamworkGraph(query, { cypherQuery: cypher });
    const body = (await res.json()) as {
      errors?: unknown[];
      data?: { cypherQuery?: { edges?: { node?: { columns?: { value?: { id?: string } }[] } }[] } };
    };
    if (!res.ok || body.errors?.length || !body.data?.cypherQuery) {
      throw new Error('Teamwork Graph query unavailable');
    }
    const ids = (body.data.cypherQuery.edges ?? []).flatMap((e) => (e.node?.columns ?? []).map((c) => c.value?.id ?? '')).filter(Boolean);
    return {
      linkedKeys: ids.map((id) => /issue\/(?:\d+\/)?([A-Z][A-Z0-9]+-\d+)/.exec(id)?.[1] ?? '').filter(Boolean),
      pageIds: ids.map((id) => /page\/(\d+)/.exec(id)?.[1] ?? '').filter(Boolean),
      people: ids.map((id) => /(?:user|identity)[:/]([\w:-]+)/.exec(id)?.[1] ?? '').filter(Boolean),
    };
  }
}

/** REST fallback: issue links, parent, remote (Confluence) links, assignee and reporter. */
export class RestGraphProvider implements ContextGraph {
  readonly name = 'rest';
  async neighbours(issueKey: string): Promise<GraphNeighbourhood> {
    const issue = await getIssue(issueKey);
    const f = issue.fields;
    const linkedKeys = (f.issuelinks ?? []).map((l) => l.inwardIssue?.key ?? l.outwardIssue?.key ?? '').filter(Boolean);
    if (f.parent?.key) linkedKeys.push(f.parent.key);
    const people = [f.assignee?.accountId, f.reporter?.accountId].filter((x): x is string => Boolean(x));
    const pageIds: string[] = [];
    try {
      const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/remotelink`, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const links = (await res.json()) as { object?: { url?: string } }[];
        for (const l of links) {
          const m = /pageId=(\d+)|\/pages\/(\d+)/.exec(l.object?.url ?? '');
          if (m) pageIds.push(m[1] ?? m[2] ?? '');
        }
      }
    } catch {
      // remote links are optional context
    }
    return { linkedKeys, pageIds: pageIds.filter(Boolean), people };
  }
}

/** Try Teamwork Graph first (when enabled), fall back to REST, never throw. */
export class CompositeGraph implements ContextGraph {
  readonly name = 'composite';
  private primaryBroken = false;
  constructor(
    private readonly primary: ContextGraph | null,
    private readonly fallback: ContextGraph,
  ) {}
  async neighbours(issueKey: string): Promise<GraphNeighbourhood> {
    if (this.primary && !this.primaryBroken) {
      try {
        return await this.primary.neighbours(issueKey);
      } catch {
        this.primaryBroken = true;
      }
    }
    try {
      return await this.fallback.neighbours(issueKey);
    } catch {
      return EMPTY_NEIGHBOURHOOD;
    }
  }
}

export function contextGraph(useTeamworkGraph: boolean): ContextGraph {
  return new CompositeGraph(useTeamworkGraph ? new TeamworkGraphProvider() : null, new RestGraphProvider());
}
