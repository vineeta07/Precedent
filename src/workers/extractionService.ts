import type { LlmCache, LlmClient } from '../ai/client';
import { extractSection } from '../ai/extract';
import type { LedgerRepository } from '../ledger/repository';
import { splitPlain, splitStorage, type Section } from '../ledger/sections';
import type { SourceType } from '../ledger/types';
import { truncate } from '../ledger/text';

export interface SourceDocument {
  /** Stable id of the source: Confluence page id, or issue key (+ comment id). */
  id: string;
  type: SourceType;
  title: string;
  url: string | null;
  date: string | null;
  /** Confluence storage XHTML or plain text. */
  body: string;
  format: 'storage' | 'plain';
}

export interface ExtractionDeps {
  repo: LedgerRepository;
  llm?: LlmClient | null;
  cache?: LlmCache;
  /** Resolve a person's display name to an Atlassian account. Returns null when unsure. */
  resolveOwner?: (name: string) => Promise<{ accountId: string; displayName: string } | null>;
}

export interface ExtractionOutcome {
  sourceId: string;
  sections: number;
  skipped: number;
  decisions: number;
  promises: number;
  incidentKey: string | null;
  method: 'llm' | 'heuristic' | 'none';
}

const POSTMORTEM = /post[- ]?mortem|post[- ]incident|incident review|\bPIR\b|\bRCA\b|root cause/i;
const ISSUE_KEY = /\b([A-Z][A-Z0-9]+-\d+)\b/;

/** A page is treated as a post-incident review when its title says so. The incident key comes from the title. */
export function detectIncident(doc: Pick<SourceDocument, 'title' | 'type' | 'id'>): string | null {
  if (doc.type === 'jsm_pir') return doc.id.split(':')[0] ?? null;
  if (!POSTMORTEM.test(doc.title)) return null;
  return ISSUE_KEY.exec(doc.title)?.[1] ?? null;
}

export async function processDocument(doc: SourceDocument, deps: ExtractionDeps): Promise<ExtractionOutcome> {
  const { repo } = deps;
  const sections: Section[] = doc.format === 'storage' ? splitStorage(doc.body) : splitPlain(doc.body);
  const outcome: ExtractionOutcome = {
    sourceId: doc.id,
    sections: sections.length,
    skipped: 0,
    decisions: 0,
    promises: 0,
    incidentKey: detectIncident(doc),
    method: 'none',
  };
  const owners = new Map<string, { accountId: string; displayName: string } | null>();
  const resolve = async (name: string | null) => {
    if (!name || !deps.resolveOwner) return null;
    if (!owners.has(name)) owners.set(name, await deps.resolveOwner(name).catch(() => null));
    return owners.get(name) ?? null;
  };

  if (outcome.incidentKey) {
    const first = sections.find((s) => s.text.length > 40) ?? sections[0];
    await repo.upsertIncident({
      key: outcome.incidentKey,
      summary: doc.title.replace(POSTMORTEM, '').replace(/^[\s:–—-]+|[\s:–—-]+$/g, '') || doc.title,
      description: truncate(first?.text ?? '', 2000),
      occurredAt: doc.date,
      postmortemUrl: doc.url,
      scopeTags: [],
    });
  }

  for (const section of sections) {
    if (await repo.sectionSeen(doc.id, section.hash)) {
      outcome.skipped++;
      continue;
    }
    if (section.text.length < 25) {
      await repo.markSectionSeen(doc.id, section.hash);
      continue;
    }
    const result = await extractSection(
      { sourceTitle: doc.title, sourceDate: doc.date, heading: section.heading, text: section.text },
      { llm: deps.llm, cache: deps.cache },
    );
    outcome.method = result.method;

    for (const d of result.decisions) {
      const owner = await resolve(d.owner_name);
      const { created } = await repo.upsertDecision({
        title: d.title,
        statement: d.statement,
        rationale: d.rationale,
        alternativesRejected: d.alternatives_rejected,
        scopeTags: d.scope_tags.map((t) => t.toLowerCase()),
        ownerAccountId: owner?.accountId ?? null,
        ownerName: owner?.displayName ?? d.owner_name,
        decidedAt: d.decided_at ?? doc.date,
        // Extracted decisions start as proposed until a human confirms them in the byline or ledger,
        // unless the model is very sure the text records a final decision.
        status: d.status === 'accepted' && d.confidence >= 0.85 ? 'accepted' : 'proposed',
        sourceType: doc.type,
        sourceId: doc.id,
        sourceUrl: doc.url,
        sourceSnippet: d.quote,
        confidence: d.confidence,
      });
      if (created) outcome.decisions++;
    }

    for (const p of result.promises) {
      const owner = await resolve(p.owner_name);
      const { promise, created } = await repo.upsertPromise({
        statement: p.statement,
        originType: outcome.incidentKey ? 'jsm_pir' : doc.type,
        originId: outcome.incidentKey ?? doc.id,
        ownerAccountId: owner?.accountId ?? null,
        ownerName: owner?.displayName ?? p.owner_name,
        dueDate: p.due_date,
        linkedIssueKey: p.linked_issue_key,
        sourceUrl: doc.url,
        sourceSnippet: p.quote,
        scopeTags: p.scope_tags.map((t) => t.toLowerCase()),
      });
      if (created) {
        outcome.promises++;
        if (p.linked_issue_key) {
          await repo.addLink({ entityId: promise.id, targetType: 'issue', targetId: p.linked_issue_key, relation: 'tracked_by' });
        }
        if (outcome.incidentKey) {
          await repo.addLink({ entityId: promise.id, targetType: 'incident', targetId: outcome.incidentKey, relation: 'promised_after' });
        }
      }
    }
    await repo.markSectionSeen(doc.id, section.hash);
  }
  return outcome;
}
