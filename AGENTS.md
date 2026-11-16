# Precedent: project context

Forge app for Codegeist 2026 (Apps for Software Teams; bonus: Best Agents). Author: Vineeta.

## Product

Teams forget what they decided and promised. Precedent:

1. **Extracts** decisions and promises from Confluence pages, JSM post-incident reviews and Jira comments. Never invents: every item carries a verbatim source quote that is verified.
2. **Guards** new work: on Jira work item / JSM incident create or update, flags CONFLICT (against an accepted decision), DÉJÀ VU (resembles a past incident with open promised fixes), OPEN PROMISE.
3. **Tracks** promises in a ledger (owner, source, due date, status open/kept/broken/overdue synced from linked issues) with a keep rate.
4. **Lifecycle:** proposed → accepted → superseded. The chain is kept, never overwritten. Superseded decisions never flag.

Every flag shown to a user must cite source link + quote + who + when.

## Rules for this repository

- Commits are authored by Vineeta only. No co-author or tool attribution lines, in commits, PRs or code.
- TypeScript strict everywhere. Verify Forge APIs against the installed package typings and `@forge/manifest` schema; never invent an API.
- The UI never waits on an LLM. AI work happens in queue consumers.
- No secrets and no site-specific IDs in `src/`.
- After every change: `npm run check` (eval cases build, typecheck, tests, manifest validation) and `npm run ui:build`.
- UI: no neon colours; fonts are Fraunces (display), Instrument Sans (body), JetBrains Mono (keys). Colours come from `static/shared/src/styles/tokens.css`. Everything animates with the shared `EASE` curve and respects reduced motion.

## Layout

- `manifest.yml`: all modules. `npm run lint:manifest` validates it offline.
- `src/ledger`: pure logic (types, schema, repository, candidates, rules, views, text, sections).
- `src/ai`: prompts, zod schemas, strict JSON client, extract, judge, explain, eval.
- `src/workers`: triggers, queue consumers, extraction/guard services, promise sync, sample loader.
- `src/resolvers`: UI API, `{ ok, data } | { ok:false, error }` envelope, admin checks.
- `src/rovo`: agent actions (also the MCP tools). `src/graph`: Teamwork Graph + REST fallback. `src/platform`: Forge adapters.
- `src/frontend`: UI Kit issue panel and Confluence byline.
- `src/seed`: Nimbus Pay sample world (DEC-12 Firebase, INC-214 checkout timeouts).
- `static/shared/src`: the Custom UI app. `static/ledger`, `static/admin`: entry points.
- `tests/unit`, `tests/eval/conflicts.jsonl` (source of truth; `npm run eval:build` generates `src/ai/eval/cases.ts`).
- `scripts/build-mock.ts`: regenerates the UI preview fixture from the real pipeline (`npm run mock:build`).

## Thresholds

Confidence < 0.55 ignore; 0.55–0.80 panel only; > 0.80 panel + optional Jira comment (setting, off by default). Edits debounced 60 s. Never comment twice for the same target.

## Status

Built and tested locally. Not yet deployed: needs `forge register`, `forge deploy`, `forge install` with the owner's Atlassian login. See `docs/SPIKE.md` for what to verify on the site, `docs/EVAL.md` for numbers.

Review helpers live in `.agents/agents/`.
