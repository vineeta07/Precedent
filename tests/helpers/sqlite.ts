import { DatabaseSync } from 'node:sqlite';
import { LedgerRepository, type SqlExecutor } from '../../src/ledger/repository';
import { MIGRATIONS } from '../../src/ledger/schema';

/** Runs the real Forge SQL migrations and repository against an in-memory SQLite database. */
export function memoryLedger(): { repo: LedgerRepository; db: SqlExecutor } {
  const sqlite = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) sqlite.exec(m.statement);
  const bind = (params: unknown[]) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p)) as (string | number | null)[];
  const db: SqlExecutor = {
    async query<T>(sql: string, params: unknown[] = []) {
      return sqlite.prepare(sql).all(...bind(params)).map((r) => ({ ...r })) as T[];
    },
    async run(sql: string, params: unknown[] = []) {
      const res = sqlite.prepare(sql).run(...bind(params));
      return { affectedRows: Number(res.changes) };
    },
  };
  return { repo: new LedgerRepository(db), db };
}
