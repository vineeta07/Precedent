import { randomUUID } from 'crypto';
import type {
  Commitment,
  Decision,
  DecisionStatus,
  Feedback,
  FeedbackVerdict,
  Flag,
  HistoryEntry,
  Incident,
  Link,
  PromiseStatus,
  SourceType,
} from './types';
import { assertTransition } from './rules';
import { sha256, normalizeWhitespace } from './text';

/** Minimal SQL surface. Forge SQL implements it in production, SQLite in tests. */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ affectedRows: number }>;
}

type Row = Record<string, unknown>;

const now = () => new Date().toISOString();
const json = (v: unknown) => JSON.stringify(v ?? []);
const parseList = (v: unknown): string[] => {
  if (typeof v !== 'string' || !v) return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function toDecision(r: Row): Decision {
  return {
    id: String(r.id),
    key: String(r.dkey),
    title: String(r.title),
    statement: String(r.statement),
    rationale: String(r.rationale ?? ''),
    alternativesRejected: parseList(r.alternatives_rejected),
    scopeTags: parseList(r.scope_tags),
    ownerAccountId: str(r.owner_account_id),
    ownerName: str(r.owner_name),
    decidedAt: str(r.decided_at),
    status: String(r.status) as DecisionStatus,
    supersededBy: str(r.superseded_by),
    sourceType: String(r.source_type) as SourceType,
    sourceId: str(r.source_id),
    sourceUrl: str(r.source_url),
    sourceSnippet: String(r.source_snippet ?? ''),
    contentHash: String(r.content_hash),
    confidence: Number(r.confidence),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function toPromise(r: Row): Commitment {
  return {
    id: String(r.id),
    key: String(r.pkey),
    statement: String(r.statement),
    originType: String(r.origin_type) as SourceType,
    originId: str(r.origin_id),
    ownerAccountId: str(r.owner_account_id),
    ownerName: str(r.owner_name),
    dueDate: str(r.due_date),
    linkedIssueKey: str(r.linked_issue_key),
    status: String(r.status) as PromiseStatus,
    sourceUrl: str(r.source_url),
    sourceSnippet: String(r.source_snippet ?? ''),
    scopeTags: parseList(r.scope_tags),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function toIncident(r: Row): Incident {
  return {
    key: String(r.ikey),
    summary: String(r.summary),
    description: String(r.description ?? ''),
    occurredAt: str(r.occurred_at),
    postmortemUrl: str(r.postmortem_url),
    scopeTags: parseList(r.scope_tags),
  };
}

function toFlag(r: Row): Flag {
  return {
    id: String(r.id),
    workItemKey: String(r.work_item_key),
    targetType: String(r.target_type) as Flag['targetType'],
    targetId: String(r.target_id),
    kind: String(r.kind) as Flag['kind'],
    confidence: Number(r.confidence),
    explanation: String(r.explanation ?? ''),
    dismissed: Number(r.dismissed) === 1,
    commented: Number(r.commented) === 1,
    createdAt: String(r.created_at),
  };
}

export interface DecisionInput {
  title: string;
  statement: string;
  rationale?: string;
  alternativesRejected?: string[];
  scopeTags?: string[];
  ownerAccountId?: string | null;
  ownerName?: string | null;
  decidedAt?: string | null;
  status?: DecisionStatus;
  sourceType: SourceType;
  sourceId?: string | null;
  sourceUrl?: string | null;
  sourceSnippet: string;
  confidence: number;
  sample?: boolean;
}

export interface PromiseInput {
  statement: string;
  originType: SourceType;
  originId?: string | null;
  ownerAccountId?: string | null;
  ownerName?: string | null;
  dueDate?: string | null;
  linkedIssueKey?: string | null;
  status?: PromiseStatus;
  sourceUrl?: string | null;
  sourceSnippet: string;
  scopeTags?: string[];
  sample?: boolean;
}

export interface FlagInput {
  targetType: Flag['targetType'];
  targetId: string;
  kind: Flag['kind'];
  confidence: number;
  explanation: string;
}

export interface DecisionFilter {
  status?: DecisionStatus | 'all';
  search?: string;
  sourceId?: string;
  tag?: string;
  limit?: number;
}

export interface PromiseFilter {
  status?: PromiseStatus | 'all';
  search?: string;
  originId?: string;
  ownerAccountId?: string;
  limit?: number;
}

export function decisionHash(statement: string, sourceId: string | null | undefined): string {
  return sha256((sourceId ?? '') + '|' + normalizeWhitespace(statement).toLowerCase());
}

export class LedgerRepository {
  constructor(private readonly db: SqlExecutor) {}

  /* ------------------------------------------------------------ counters */

  async nextKey(prefix: 'DEC' | 'PRM'): Promise<string> {
    const updated = await this.db.run('UPDATE counters SET value = value + 1 WHERE name = ?', [prefix]);
    if (updated.affectedRows === 0) {
      try {
        await this.db.run('INSERT INTO counters (name, value) VALUES (?, ?)', [prefix, 1]);
      } catch {
        await this.db.run('UPDATE counters SET value = value + 1 WHERE name = ?', [prefix]);
      }
    }
    const rows = await this.db.query<{ value: number }>('SELECT value FROM counters WHERE name = ?', [prefix]);
    return `${prefix}-${Number(rows[0]?.value ?? 1)}`;
  }

  /** Sample data uses fixed keys (DEC-12 …) so the demo story reads naturally. Keeps the counter ahead of them. */
  async bumpCounter(prefix: 'DEC' | 'PRM', atLeast: number): Promise<void> {
    const rows = await this.db.query<{ value: number }>('SELECT value FROM counters WHERE name = ?', [prefix]);
    if (!rows.length) await this.db.run('INSERT INTO counters (name, value) VALUES (?, ?)', [prefix, atLeast]);
    else if (Number(rows[0]?.value) < atLeast) await this.db.run('UPDATE counters SET value = ? WHERE name = ?', [atLeast, prefix]);
  }

  /* ----------------------------------------------------------- decisions */

  async upsertDecision(input: DecisionInput, fixedKey?: string): Promise<{ decision: Decision; created: boolean }> {
    const hash = decisionHash(input.statement, input.sourceId);
    const existing = await this.db.query<Row>('SELECT * FROM decisions WHERE content_hash = ?', [hash]);
    const ts = now();
    if (existing[0]) {
      const cur = toDecision(existing[0]);
      await this.db.run(
        `UPDATE decisions SET title = ?, rationale = ?, alternatives_rejected = ?, scope_tags = ?,
          owner_account_id = ?, owner_name = ?, decided_at = ?, source_url = ?, source_snippet = ?, confidence = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.title,
          input.rationale ?? cur.rationale,
          json(input.alternativesRejected ?? cur.alternativesRejected),
          json(input.scopeTags ?? cur.scopeTags),
          input.ownerAccountId ?? cur.ownerAccountId,
          input.ownerName ?? cur.ownerName,
          input.decidedAt ?? cur.decidedAt,
          input.sourceUrl ?? cur.sourceUrl,
          input.sourceSnippet,
          input.confidence,
          ts,
          cur.id,
        ],
      );
      return { decision: (await this.getDecision(cur.id)) as Decision, created: false };
    }
    const id = randomUUID();
    const key = fixedKey ?? (await this.nextKey('DEC'));
    await this.db.run(
      `INSERT INTO decisions (id, dkey, title, statement, rationale, alternatives_rejected, scope_tags, owner_account_id,
        owner_name, decided_at, status, superseded_by, source_type, source_id, source_url, source_snippet, content_hash,
        confidence, sample, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        key,
        input.title,
        input.statement,
        input.rationale ?? '',
        json(input.alternativesRejected),
        json(input.scopeTags),
        input.ownerAccountId ?? null,
        input.ownerName ?? null,
        input.decidedAt ?? null,
        input.status ?? 'proposed',
        null,
        input.sourceType,
        input.sourceId ?? null,
        input.sourceUrl ?? null,
        input.sourceSnippet,
        hash,
        input.confidence,
        input.sample ? 1 : 0,
        ts,
        ts,
      ],
    );
    await this.addHistory(id, 'created', null, `Extracted from ${input.sourceType}`);
    return { decision: (await this.getDecision(id)) as Decision, created: true };
  }

  async getDecision(idOrKey: string): Promise<Decision | null> {
    const rows = await this.db.query<Row>('SELECT * FROM decisions WHERE id = ? OR dkey = ?', [idOrKey, idOrKey.toUpperCase()]);
    return rows[0] ? toDecision(rows[0]) : null;
  }

  async listDecisions(filter: DecisionFilter = {}): Promise<Decision[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.status && filter.status !== 'all') {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter.sourceId) {
      where.push('source_id = ?');
      params.push(filter.sourceId);
    }
    if (filter.search) {
      where.push('(LOWER(title) LIKE ? OR LOWER(statement) LIKE ? OR LOWER(dkey) LIKE ?)');
      const like = `%${filter.search.toLowerCase()}%`;
      params.push(like, like, like);
    }
    if (filter.tag) {
      where.push('LOWER(scope_tags) LIKE ?');
      params.push(`%"${filter.tag.toLowerCase()}"%`);
    }
    const limit = Math.min(Math.max(filter.limit ?? 500, 1), 1000);
    const rows = await this.db.query<Row>(
      `SELECT * FROM decisions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY decided_at DESC, created_at DESC LIMIT ${limit}`,
      params,
    );
    return rows.map(toDecision);
  }

  async setDecisionStatus(id: string, to: DecisionStatus, actor: string | null, note = ''): Promise<Decision> {
    const d = await this.getDecision(id);
    if (!d) throw new Error('Decision not found');
    if (d.status === to) return d;
    assertTransition(d.status, to);
    await this.db.run('UPDATE decisions SET status = ?, updated_at = ? WHERE id = ?', [to, now(), d.id]);
    await this.addHistory(d.id, `status:${to}`, actor, note || `Status changed ${d.status} → ${to}`);
    return (await this.getDecision(d.id)) as Decision;
  }

  async editDecision(id: string, patch: Partial<Pick<Decision, 'title' | 'statement' | 'rationale' | 'scopeTags'>>, actor: string | null): Promise<Decision> {
    const d = await this.getDecision(id);
    if (!d) throw new Error('Decision not found');
    await this.db.run(
      'UPDATE decisions SET title = ?, statement = ?, rationale = ?, scope_tags = ?, updated_at = ? WHERE id = ?',
      [patch.title ?? d.title, patch.statement ?? d.statement, patch.rationale ?? d.rationale, json(patch.scopeTags ?? d.scopeTags), now(), d.id],
    );
    await this.addHistory(d.id, 'edited', actor, 'Edited by a reviewer');
    return (await this.getDecision(d.id)) as Decision;
  }

  /**
   * Supersede keeps the chain: the old decision is never overwritten, it points at its successor.
   */
  async supersede(oldId: string, successor: DecisionInput | { existingId: string }, actor: string | null, reason: string): Promise<{ old: Decision; next: Decision }> {
    const old = await this.getDecision(oldId);
    if (!old) throw new Error('Decision not found');
    if (old.status === 'superseded') throw new Error(`${old.key} is already superseded`);
    let next: Decision | null;
    if ('existingId' in successor) next = await this.getDecision(successor.existingId);
    else next = (await this.upsertDecision({ ...successor, status: 'accepted' })).decision;
    if (!next) throw new Error('Successor decision not found');
    if (next.id === old.id) throw new Error('A decision cannot supersede itself');
    if (next.status === 'proposed') await this.setDecisionStatus(next.id, 'accepted', actor, 'Accepted as successor of ' + old.key);
    if (old.status === 'proposed') await this.setDecisionStatus(old.id, 'accepted', actor, 'Accepted before supersede');
    await this.db.run('UPDATE decisions SET status = ?, superseded_by = ?, updated_at = ? WHERE id = ?', ['superseded', next.id, now(), old.id]);
    await this.addHistory(old.id, 'superseded', actor, `Superseded by ${next.key}: ${reason}`);
    await this.addHistory(next.id, 'supersedes', actor, `Supersedes ${old.key}: ${reason}`);
    await this.addLink({ entityId: next.id, targetType: 'decision', targetId: old.id, relation: 'supersedes' });
    return { old: (await this.getDecision(old.id)) as Decision, next: (await this.getDecision(next.id)) as Decision };
  }

  /* ------------------------------------------------------------ promises */

  async upsertPromise(input: PromiseInput, fixedKey?: string): Promise<{ promise: Commitment; created: boolean }> {
    const hash = sha256((input.originId ?? '') + '|' + normalizeWhitespace(input.statement).toLowerCase());
    const existing = await this.db.query<Row>('SELECT * FROM promises WHERE content_hash = ?', [hash]);
    const ts = now();
    if (existing[0]) {
      const cur = toPromise(existing[0]);
      await this.db.run(
        `UPDATE promises SET owner_account_id = ?, owner_name = ?, due_date = ?, linked_issue_key = ?, source_url = ?,
          source_snippet = ?, scope_tags = ?, updated_at = ? WHERE id = ?`,
        [
          input.ownerAccountId ?? cur.ownerAccountId,
          input.ownerName ?? cur.ownerName,
          input.dueDate ?? cur.dueDate,
          input.linkedIssueKey ?? cur.linkedIssueKey,
          input.sourceUrl ?? cur.sourceUrl,
          input.sourceSnippet,
          json(input.scopeTags ?? cur.scopeTags),
          ts,
          cur.id,
        ],
      );
      return { promise: (await this.getPromise(cur.id)) as Commitment, created: false };
    }
    const id = randomUUID();
    const key = fixedKey ?? (await this.nextKey('PRM'));
    await this.db.run(
      `INSERT INTO promises (id, pkey, statement, origin_type, origin_id, owner_account_id, owner_name, due_date,
        linked_issue_key, status, source_url, source_snippet, scope_tags, content_hash, sample, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        key,
        input.statement,
        input.originType,
        input.originId ?? null,
        input.ownerAccountId ?? null,
        input.ownerName ?? null,
        input.dueDate ?? null,
        input.linkedIssueKey ?? null,
        input.status ?? 'open',
        input.sourceUrl ?? null,
        input.sourceSnippet,
        json(input.scopeTags),
        hash,
        input.sample ? 1 : 0,
        ts,
        ts,
      ],
    );
    await this.addHistory(id, 'created', null, `Promise recorded from ${input.originType}`);
    return { promise: (await this.getPromise(id)) as Commitment, created: true };
  }

  async getPromise(idOrKey: string): Promise<Commitment | null> {
    const rows = await this.db.query<Row>('SELECT * FROM promises WHERE id = ? OR pkey = ?', [idOrKey, idOrKey.toUpperCase()]);
    return rows[0] ? toPromise(rows[0]) : null;
  }

  async listPromises(filter: PromiseFilter = {}): Promise<Commitment[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.status && filter.status !== 'all') {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter.originId) {
      where.push('origin_id = ?');
      params.push(filter.originId);
    }
    if (filter.ownerAccountId) {
      where.push('owner_account_id = ?');
      params.push(filter.ownerAccountId);
    }
    if (filter.search) {
      where.push('(LOWER(statement) LIKE ? OR LOWER(pkey) LIKE ? OR LOWER(linked_issue_key) LIKE ?)');
      const like = `%${filter.search.toLowerCase()}%`;
      params.push(like, like, like);
    }
    const limit = Math.min(Math.max(filter.limit ?? 500, 1), 1000);
    const rows = await this.db.query<Row>(
      `SELECT * FROM promises ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY due_date DESC, created_at DESC LIMIT ${limit}`,
      params,
    );
    return rows.map(toPromise);
  }

  async setPromiseStatus(id: string, status: PromiseStatus, actor: string | null, note = ''): Promise<void> {
    const p = await this.getPromise(id);
    if (!p || p.status === status) return;
    await this.db.run('UPDATE promises SET status = ?, updated_at = ? WHERE id = ?', [status, now(), p.id]);
    await this.addHistory(p.id, `status:${status}`, actor, note || `Status ${p.status} → ${status}`);
  }

  async linkPromiseIssue(id: string, issueKey: string): Promise<void> {
    await this.db.run('UPDATE promises SET linked_issue_key = ?, updated_at = ? WHERE id = ?', [issueKey.toUpperCase(), now(), id]);
  }

  /* ----------------------------------------------------------- incidents */

  async upsertIncident(inc: Incident, sample = false): Promise<void> {
    const rows = await this.db.query<Row>('SELECT ikey FROM incidents WHERE ikey = ?', [inc.key]);
    if (rows.length) {
      await this.db.run(
        'UPDATE incidents SET summary = ?, description = ?, occurred_at = ?, postmortem_url = ?, scope_tags = ? WHERE ikey = ?',
        [inc.summary, inc.description, inc.occurredAt, inc.postmortemUrl, json(inc.scopeTags), inc.key],
      );
    } else {
      await this.db.run(
        'INSERT INTO incidents (ikey, summary, description, occurred_at, postmortem_url, scope_tags, sample) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [inc.key, inc.summary, inc.description, inc.occurredAt, inc.postmortemUrl, json(inc.scopeTags), sample ? 1 : 0],
      );
    }
  }

  async listIncidents(): Promise<Incident[]> {
    return (await this.db.query<Row>('SELECT * FROM incidents ORDER BY occurred_at DESC LIMIT 500')).map(toIncident);
  }

  async deleteIncident(key: string): Promise<void> {
    await this.db.run('DELETE FROM incidents WHERE ikey = ?', [key.toUpperCase()]);
  }

  async getIncident(key: string): Promise<Incident | null> {
    const rows = await this.db.query<Row>('SELECT * FROM incidents WHERE ikey = ?', [key.toUpperCase()]);
    return rows[0] ? toIncident(rows[0]) : null;
  }

  /* --------------------------------------------------------------- flags */

  /** Replace the live (non-dismissed) flags for a work item. Dismissed flags are kept so they never come back. */
  async replaceFlags(workItemKey: string, flags: FlagInput[]): Promise<Flag[]> {
    const key = workItemKey.toUpperCase();
    const current = (await this.db.query<Row>('SELECT * FROM flags WHERE work_item_key = ?', [key])).map(toFlag);
    const dismissedTargets = new Set(current.filter((f) => f.dismissed).map((f) => `${f.targetType}:${f.targetId}`));
    const commentedTargets = new Set(current.filter((f) => f.commented).map((f) => `${f.targetType}:${f.targetId}`));
    await this.db.run('DELETE FROM flags WHERE work_item_key = ? AND dismissed = 0', [key]);
    const ts = now();
    for (const f of flags) {
      const t = `${f.targetType}:${f.targetId}`;
      if (dismissedTargets.has(t)) continue;
      await this.db.run(
        `INSERT INTO flags (id, work_item_key, target_type, target_id, kind, confidence, explanation, dismissed, commented, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), key, f.targetType, f.targetId, f.kind, f.confidence, f.explanation, 0, commentedTargets.has(t) ? 1 : 0, ts],
      );
    }
    return this.listFlags(key);
  }

  async listFlags(workItemKey: string, includeDismissed = false): Promise<Flag[]> {
    const rows = await this.db.query<Row>(
      `SELECT * FROM flags WHERE work_item_key = ? ${includeDismissed ? '' : 'AND dismissed = 0'} ORDER BY confidence DESC`,
      [workItemKey.toUpperCase()],
    );
    return rows.map(toFlag);
  }

  async listAllFlags(limit = 200): Promise<Flag[]> {
    const rows = await this.db.query<Row>(`SELECT * FROM flags ORDER BY created_at DESC LIMIT ${Math.min(limit, 1000)}`);
    return rows.map(toFlag);
  }

  async getFlag(id: string): Promise<Flag | null> {
    const rows = await this.db.query<Row>('SELECT * FROM flags WHERE id = ?', [id]);
    return rows[0] ? toFlag(rows[0]) : null;
  }

  async setFlagDismissed(id: string, dismissed: boolean): Promise<void> {
    await this.db.run('UPDATE flags SET dismissed = ? WHERE id = ?', [dismissed ? 1 : 0, id]);
  }

  async markFlagCommented(id: string): Promise<void> {
    await this.db.run('UPDATE flags SET commented = 1 WHERE id = ?', [id]);
  }

  /* ------------------------------------------------------------ feedback */

  async addFeedback(flagId: string, accountId: string, verdict: FeedbackVerdict, note = ''): Promise<Feedback> {
    const fb: Feedback = { id: randomUUID(), flagId, accountId, verdict, note, createdAt: now() };
    await this.db.run(
      'INSERT INTO feedback (id, flag_id, account_id, verdict, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [fb.id, fb.flagId, fb.accountId, fb.verdict, fb.note, fb.createdAt],
    );
    return fb;
  }

  async feedbackStats(): Promise<Record<FeedbackVerdict, number>> {
    const rows = await this.db.query<{ verdict: string; n: number }>('SELECT verdict, COUNT(*) AS n FROM feedback GROUP BY verdict');
    const out: Record<FeedbackVerdict, number> = { still_applies: 0, not_related: 0, superseded: 0 };
    for (const r of rows) if (r.verdict in out) out[r.verdict as FeedbackVerdict] = Number(r.n);
    return out;
  }

  /* --------------------------------------------------------------- links */

  async addLink(link: Link): Promise<void> {
    const rows = await this.db.query<Row>(
      'SELECT entity_id FROM links WHERE entity_id = ? AND target_type = ? AND target_id = ? AND relation = ?',
      [link.entityId, link.targetType, link.targetId, link.relation],
    );
    if (rows.length) return;
    await this.db.run('INSERT INTO links (entity_id, target_type, target_id, relation) VALUES (?, ?, ?, ?)', [
      link.entityId,
      link.targetType,
      link.targetId,
      link.relation,
    ]);
  }

  async linksFor(entityId: string): Promise<Link[]> {
    const rows = await this.db.query<Row>('SELECT * FROM links WHERE entity_id = ? OR target_id = ?', [entityId, entityId]);
    return rows.map((r) => ({
      entityId: String(r.entity_id),
      targetType: String(r.target_type),
      targetId: String(r.target_id),
      relation: String(r.relation),
    }));
  }

  /* ------------------------------------------------------------- history */

  async addHistory(entityId: string, kind: string, actor: string | null, detail: string): Promise<void> {
    await this.db.run('INSERT INTO history (id, entity_id, kind, actor_account_id, detail, at) VALUES (?, ?, ?, ?, ?, ?)', [
      randomUUID(),
      entityId,
      kind,
      actor,
      detail,
      now(),
    ]);
  }

  async historyFor(entityId: string): Promise<HistoryEntry[]> {
    const rows = await this.db.query<Row>('SELECT * FROM history WHERE entity_id = ? ORDER BY at ASC', [entityId]);
    return rows.map((r) => ({
      id: String(r.id),
      entityId: String(r.entity_id),
      kind: String(r.kind),
      actorAccountId: str(r.actor_account_id),
      detail: String(r.detail ?? ''),
      at: String(r.at),
    }));
  }

  async recentHistory(limit = 30): Promise<HistoryEntry[]> {
    const rows = await this.db.query<Row>(`SELECT * FROM history ORDER BY at DESC LIMIT ${Math.min(limit, 200)}`);
    return rows.map((r) => ({
      id: String(r.id),
      entityId: String(r.entity_id),
      kind: String(r.kind),
      actorAccountId: str(r.actor_account_id),
      detail: String(r.detail ?? ''),
      at: String(r.at),
    }));
  }

  /* ------------------------------------------------- incremental scanning */

  async sectionSeen(sourceId: string, hash: string): Promise<boolean> {
    const rows = await this.db.query<Row>('SELECT section_hash FROM source_sections WHERE source_id = ? AND section_hash = ?', [sourceId, hash]);
    return rows.length > 0;
  }

  async markSectionSeen(sourceId: string, hash: string): Promise<void> {
    if (await this.sectionSeen(sourceId, hash)) return;
    await this.db.run('INSERT INTO source_sections (source_id, section_hash, seen_at) VALUES (?, ?, ?)', [sourceId, hash, now()]);
  }

  /* ----------------------------------------------------------- llm cache */

  async cacheGet(hash: string): Promise<string | null> {
    const rows = await this.db.query<Row>('SELECT response FROM llm_cache WHERE hash = ?', [hash]);
    return rows[0] ? String(rows[0].response) : null;
  }

  async cacheSet(hash: string, response: string): Promise<void> {
    await this.db.run('DELETE FROM llm_cache WHERE hash = ?', [hash]);
    await this.db.run('INSERT INTO llm_cache (hash, response, created_at) VALUES (?, ?, ?)', [hash, response, now()]);
  }

  /* --------------------------------------------------------------- admin */

  async counts(): Promise<{ decisions: number; promises: number; incidents: number; flags: number; sample: number }> {
    const one = async (q: string) => Number((await this.db.query<{ n: number }>(q))[0]?.n ?? 0);
    return {
      decisions: await one('SELECT COUNT(*) AS n FROM decisions'),
      promises: await one('SELECT COUNT(*) AS n FROM promises'),
      incidents: await one('SELECT COUNT(*) AS n FROM incidents'),
      flags: await one('SELECT COUNT(*) AS n FROM flags'),
      sample: await one('SELECT COUNT(*) AS n FROM decisions WHERE sample = 1'),
    };
  }

  async clearSample(): Promise<void> {
    const ids = [
      ...(await this.db.query<Row>('SELECT id FROM decisions WHERE sample = 1')),
      ...(await this.db.query<Row>('SELECT id FROM promises WHERE sample = 1')),
    ].map((r) => String(r.id));
    for (const id of ids) {
      await this.db.run('DELETE FROM history WHERE entity_id = ?', [id]);
      await this.db.run('DELETE FROM links WHERE entity_id = ? OR target_id = ?', [id, id]);
      await this.db.run('DELETE FROM flags WHERE target_id = ?', [id]);
    }
    await this.db.run('DELETE FROM decisions WHERE sample = 1');
    await this.db.run('DELETE FROM promises WHERE sample = 1');
    const incs = await this.db.query<Row>('SELECT ikey FROM incidents WHERE sample = 1');
    for (const r of incs) await this.db.run('DELETE FROM flags WHERE target_id = ?', [String(r.ikey)]);
    await this.db.run('DELETE FROM incidents WHERE sample = 1');
  }
}
