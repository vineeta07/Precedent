import type { LlmCache, LlmClient } from '../ai/client';
import { decisionTarget, judge, matchIncident, promiseTarget } from '../ai/judge';
import { EMPTY_NEIGHBOURHOOD, retrieveCandidates, type GraphNeighbourhood } from '../ledger/candidates';
import type { FlagInput, LedgerRepository } from '../ledger/repository';
import { routeFlag } from '../ledger/rules';
import type { Flag, LedgerSettings, WorkItem } from '../ledger/types';

export interface GuardDeps {
  repo: LedgerRepository;
  settings: LedgerSettings;
  llm?: LlmClient | null;
  cache?: LlmCache;
  neighbours?: (issueKey: string) => Promise<GraphNeighbourhood>;
  /** Post one summary comment on the work item. Only called for new, high-confidence flags when enabled. */
  comment?: (issueKey: string, text: string) => Promise<void>;
}

export interface GuardOutcome {
  workItemKey: string;
  candidates: number;
  flags: Flag[];
  commented: boolean;
  method: 'llm' | 'heuristic';
}

export const GUARD_COMMENT_PREFIX = 'Precedent found';

export function commentText(flags: FlagInput[], names: Map<string, string>): string {
  const lines = flags.map((f) => {
    const label = f.kind === 'conflict' ? 'Conflict' : f.kind === 'deja_vu' ? 'Déjà vu' : f.kind === 'open_promise' ? 'Open promise' : 'Revisits';
    return `${label} · ${names.get(f.targetId) ?? f.targetId}: ${f.explanation}`;
  });
  return `${GUARD_COMMENT_PREFIX} earlier decisions or promises that apply here.\n${lines.join('\n')}\nOpen the Precedent panel on this work item for sources.`;
}

export async function guardWorkItem(item: WorkItem, deps: GuardDeps): Promise<GuardOutcome> {
  const { repo, settings } = deps;
  const [decisions, promises, incidents] = await Promise.all([repo.listDecisions(), repo.listPromises(), repo.listIncidents()]);
  const graph = deps.neighbours ? await deps.neighbours(item.key).catch(() => EMPTY_NEIGHBOURHOOD) : EMPTY_NEIGHBOURHOOD;
  const candidates = retrieveCandidates(item, { decisions, promises, incidents }, graph, 15);
  const ai = { llm: deps.llm, cache: deps.cache };
  const inputs: FlagInput[] = [];
  const names = new Map<string, string>();
  let method: 'llm' | 'heuristic' = 'heuristic';
  const add = (f: FlagInput) => {
    if (routeFlag(f.confidence, settings) === 'ignore') return;
    const existing = inputs.find((x) => x.targetType === f.targetType && x.targetId === f.targetId);
    if (!existing) inputs.push(f);
    else if (f.confidence > existing.confidence) Object.assign(existing, f);
  };

  for (const c of candidates) {
    if (c.type === 'decision') {
      const r = await judge(item, decisionTarget(c.item), ai);
      if (r.method === 'llm') method = 'llm';
      names.set(c.item.id, c.item.key);
      if (r.relation === 'conflict') add({ targetType: 'decision', targetId: c.item.id, kind: 'conflict', confidence: r.confidence, explanation: r.explanation });
      else if (r.relation === 'revisits') add({ targetType: 'decision', targetId: c.item.id, kind: 'revisits', confidence: r.confidence, explanation: r.explanation });
    } else if (c.type === 'promise') {
      const r = await judge(item, promiseTarget(c.item), ai);
      if (r.method === 'llm') method = 'llm';
      names.set(c.item.id, c.item.key);
      if (r.relation !== 'unrelated') {
        add({
          targetType: 'promise',
          targetId: c.item.id,
          kind: 'open_promise',
          confidence: r.confidence,
          explanation: `${c.item.key} is still ${c.item.status}: ${r.explanation}`,
        });
      }
    } else {
      const r = await matchIncident(item, c.item, ai);
      if (r.method === 'llm') method = 'llm';
      if (!r.similar) continue;
      const stillOpen = promises.filter((p) => p.originId === c.item.key && p.status !== 'kept');
      names.set(c.item.key, c.item.key);
      add({
        targetType: 'incident',
        targetId: c.item.key,
        kind: 'deja_vu',
        confidence: r.confidence,
        explanation:
          stillOpen.length > 0
            ? `${r.explanation} ${stillOpen.length} of the fixes promised after ${c.item.key} ${stillOpen.length === 1 ? 'is' : 'are'} still not done.`
            : r.explanation,
      });
      for (const p of stillOpen) {
        names.set(p.id, p.key);
        add({
          targetType: 'promise',
          targetId: p.id,
          kind: 'open_promise',
          confidence: Math.max(r.confidence - 0.02, settings.ignoreBelow),
          explanation: `Promised after ${c.item.key} and still ${p.status}: "${p.statement}"`,
        });
      }
    }
  }

  // An incident becomes part of the memory so the next one can be compared with it.
  if (item.isIncident) {
    await repo.upsertIncident({
      key: item.key,
      summary: item.summary,
      description: item.description.slice(0, 2000),
      occurredAt: item.updated ?? new Date().toISOString(),
      postmortemUrl: (await repo.getIncident(item.key))?.postmortemUrl ?? null,
      scopeTags: [...item.labels, ...item.components].map((t) => t.toLowerCase()),
    });
  }

  const flags = await repo.replaceFlags(item.key, inputs);

  let commented = false;
  if (deps.comment) {
    const fresh = flags.filter((f) => !f.commented && routeFlag(f.confidence, settings) === 'panel_and_comment');
    if (fresh.length > 0) {
      const freshInputs = inputs.filter((i) => fresh.some((f) => f.targetId === i.targetId && f.targetType === i.targetType));
      try {
        await deps.comment(item.key, commentText(freshInputs, names));
        for (const f of fresh) await repo.markFlagCommented(f.id);
        commented = true;
      } catch {
        // commenting is optional; the panel still shows the flags
      }
    }
  }
  return { workItemKey: item.key, candidates: candidates.length, flags: await repo.listFlags(item.key), commented, method };
}
