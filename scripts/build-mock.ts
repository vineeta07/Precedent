/* Builds the fixture used by the UI when it runs outside Atlassian (local preview, screenshots).
   It runs the REAL pipeline (seed → guard → read models) on SQLite, so the preview never drifts from the app. */
import { writeFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, type WorkItem } from '../src/ledger/types';
import { buildDecisionDetail, buildIncidentRows, buildPanelView, buildSummary, flagCards } from '../src/ledger/views';
import { loadSampleLedger } from '../src/seed/load';
import { SEED_WORK_ITEMS } from '../src/seed/nimbusPay';
import { guardWorkItem } from '../src/workers/guardService';
import { runEval } from '../src/ai/eval/run';
import { memoryLedger } from '../tests/helpers/sqlite';

async function main() {
  const { repo } = memoryLedger();
  await loadSampleLedger(repo);
  for (const w of SEED_WORK_ITEMS) {
    const item: WorkItem = {
      key: w.fallbackKey,
      projectKey: w.fallbackKey.split('-')[0] ?? '',
      summary: w.summary,
      description: w.description,
      labels: [...w.labels],
      components: [],
      issueType: w.incident ? 'Incident' : 'Story',
      isIncident: w.incident,
    };
    await guardWorkItem(item, { repo, settings: DEFAULT_SETTINGS });
  }
  const decisions = await repo.listDecisions();
  const details: Record<string, unknown> = {};
  for (const d of decisions) details[d.id] = { ...(await buildDecisionDetail(repo, d.id)), restricted: false };
  const panels: Record<string, unknown> = {};
  for (const w of SEED_WORK_ITEMS) panels[w.fallbackKey] = await buildPanelView(repo, w.fallbackKey);
  const fixture = {
    generatedAt: '2026-11-15T09:00:00.000Z',
    summary: await buildSummary(repo, new Date('2026-11-15T09:00:00Z')),
    decisions: decisions.map((d) => ({ ...d, restricted: false })),
    details,
    promises: await repo.listPromises(),
    incidents: await buildIncidentRows(repo),
    flags: await flagCards(repo, await repo.listAllFlags(200)),
    panels,
    workItems: SEED_WORK_ITEMS.map((w) => ({ key: w.fallbackKey, summary: w.summary, incident: w.incident })),
    eval: await runEval({ llm: null }),
  };
  writeFileSync('static/shared/src/mock/fixture.json', JSON.stringify(fixture, null, 1));
  console.log(`fixture: ${decisions.length} decisions, ${fixture.promises.length} promises, ${fixture.flags.length} flags`);
}

void main();
