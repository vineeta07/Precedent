import type { LedgerRepository } from '../ledger/repository';
import { SEED_DECISIONS, SEED_INCIDENTS, SEED_PROMISES } from './nimbusPay';

export interface SeedTargets {
  /** Real Confluence pages created for the sample, keyed by page slug. */
  pages?: Record<string, { id: string; url: string }>;
  /** Real Jira issues created to track sample promises, keyed by promise key. */
  issues?: Record<string, string>;
}

export interface SeedSummary {
  decisions: number;
  promises: number;
  incidents: number;
}

/** Idempotent: loading twice leaves one copy. Every row is marked as sample so it can be removed cleanly. */
export async function loadSampleLedger(repo: LedgerRepository, targets: SeedTargets = {}): Promise<SeedSummary> {
  const ids = new Map<string, string>();
  const maxKey = (keys: string[]) => Math.max(...keys.map((k) => Number(k.split('-')[1] ?? 0)));

  for (const d of SEED_DECISIONS) {
    const page = targets.pages?.[d.page];
    const { decision } = await repo.upsertDecision(
      {
        title: d.title,
        statement: d.statement,
        rationale: d.rationale,
        alternativesRejected: d.rejected,
        scopeTags: d.tags,
        ownerName: d.owner,
        decidedAt: d.decidedAt,
        status: d.status === 'superseded' ? 'accepted' : d.status,
        sourceType: page ? 'confluence' : 'sample',
        sourceId: page?.id ?? `sample:${d.page}`,
        sourceUrl: page?.url ?? null,
        sourceSnippet: d.snippet,
        confidence: 0.95,
        sample: true,
      },
      d.key,
    );
    ids.set(d.key, decision.id);
  }
  for (const d of SEED_DECISIONS) {
    if (!d.supersedes) continue;
    const oldId = ids.get(d.supersedes);
    const newId = ids.get(d.key);
    if (!oldId || !newId) continue;
    const old = await repo.getDecision(oldId);
    if (old && old.status !== 'superseded') {
      await repo.supersede(oldId, { existingId: newId }, null, 'Reporting was starving web workers at month end');
    }
  }
  await repo.bumpCounter('DEC', maxKey(SEED_DECISIONS.map((d) => d.key)));

  for (const inc of SEED_INCIDENTS) {
    await repo.upsertIncident(
      {
        key: inc.key,
        summary: inc.summary,
        description: inc.description,
        occurredAt: inc.occurredAt,
        postmortemUrl: inc.page ? targets.pages?.[inc.page]?.url ?? null : null,
        scopeTags: inc.tags,
      },
      true,
    );
  }

  for (const p of SEED_PROMISES) {
    const page = targets.pages?.[p.page];
    const fromIncident = /^INC-/.test(p.origin);
    const { promise } = await repo.upsertPromise(
      {
        statement: p.statement,
        originType: fromIncident ? 'jsm_pir' : page ? 'confluence' : 'sample',
        originId: fromIncident ? p.origin : page?.id ?? `sample:${p.origin}`,
        ownerName: p.owner,
        dueDate: p.due,
        linkedIssueKey: targets.issues?.[p.key] ?? null,
        status: p.status,
        sourceUrl: page?.url ?? null,
        sourceSnippet: p.snippet,
        scopeTags: p.tags,
        sample: true,
      },
      p.key,
    );
    if (fromIncident) await repo.addLink({ entityId: promise.id, targetType: 'incident', targetId: p.origin, relation: 'promised_after' });
    const issue = targets.issues?.[p.key];
    if (issue) await repo.addLink({ entityId: promise.id, targetType: 'issue', targetId: issue, relation: 'tracked_by' });
  }
  await repo.bumpCounter('PRM', maxKey(SEED_PROMISES.map((p) => p.key)));

  return { decisions: SEED_DECISIONS.length, promises: SEED_PROMISES.length, incidents: SEED_INCIDENTS.length };
}
