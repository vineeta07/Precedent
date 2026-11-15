import { sql, migrationRunner } from '@forge/sql';
import type { SqlExecutor } from '../ledger/repository';
import { LedgerRepository } from '../ledger/repository';
import { MIGRATIONS } from '../ledger/schema';
import { withRetry } from './retry';

const isWrite = (q: string) => /^\s*(insert|update|delete|replace)\b/i.test(q);

export const forgeSql: SqlExecutor = {
  async query<T>(query: string, params: unknown[] = []): Promise<T[]> {
    const res = await withRetry(() => sql.prepare<T>(query).bindParams(...params).execute(), { attempts: 2 });
    return res.rows as T[];
  },
  async run(query: string, params: unknown[] = []) {
    const res = await withRetry(() => sql.prepare<{ affectedRows: number }>(query).bindParams(...params).execute(), {
      attempts: isWrite(query) ? 1 : 2,
    });
    const rows = res.rows as unknown as { affectedRows?: number };
    return { affectedRows: Number(rows?.affectedRows ?? 0) };
  },
};

let migrated: Promise<void> | null = null;

/** Runs pending migrations once per warm function instance. Safe to call from every entry point. */
export function ensureSchema(): Promise<void> {
  if (!migrated) {
    migrated = (async () => {
      let runner = migrationRunner;
      for (const m of MIGRATIONS) runner = runner.enqueue(m.name, m.statement);
      await runner.run();
    })().catch((err) => {
      migrated = null;
      throw err;
    });
  }
  return migrated;
}

export async function ledger(): Promise<LedgerRepository> {
  await ensureSchema();
  return new LedgerRepository(forgeSql);
}
