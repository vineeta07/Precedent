# Phase 0 spike: what was verified, and how

The build environment could not reach `developer.atlassian.com` or `api.atlassian.com`, and no Atlassian login was available, so the spike was done against the **published Forge packages** instead of a live site. Nothing below is guessed from memory.

| Capability | Verified against | Result | Fallback in the app |
|---|---|---|---|
| Manifest modules (`llm`, `rovo:agent`, `action`, `rovo:mcp`, `sql`, `consumer`, `trigger`, `scheduledTrigger`, `jira:issuePanel`, `jira:globalPage`, `jira:adminPage`, `confluence:contentBylineItem`) | JSON schema shipped in `@forge/manifest` 13.9; `npm run lint:manifest` validates `manifest.yml` against it | Valid | n/a |
| Forge LLMs | `@forge/llm` 1.0 typings: `chat({ model, messages, temperature, max_completion_tokens })`, `list()` | API shape confirmed. Model names are read from `list()` at runtime, never hard-coded | Rule-based extraction and judge |
| Forge SQL | `@forge/sql` 3.0 typings: `sql.prepare().bindParams().execute()`, `migrationRunner` | Confirmed. The real migrations and repository run in tests on SQLite | n/a |
| Queues | `@forge/events` 2.1: `new Queue({ key }).push({ body, delayInSeconds })`, `getJob().getStats()` | Confirmed | n/a |
| Teamwork Graph | `@forge/api` 8.5 exposes `asUser().requestTeamworkGraph(query, variables)` (user context only) | Call exists; the Cypher schema is early access and could not be exercised | REST: issue links, parent, remote links, assignee, reporter. Off by default. |
| Rovo agent action | Schema requires `function`, `description`, `actionVerb`, `inputs` | Manifest validates | Same logic is reachable from the UI |

## Still to do on a real site

1. `forge register`, `npm run build`, `forge deploy`, `forge install`.
2. Settings → Diagnostics: confirm the database and AI models are green.
3. Settings → Run AI accuracy test, and record the numbers in `docs/EVAL.md`.
4. Turn on "Use the Teamwork Graph" and confirm the guard still works (it falls back silently if not).
5. Ask the Rovo agent one of the conversation starters.

`forge lint` may ask for extra scopes for specific endpoints; add exactly what it names.
