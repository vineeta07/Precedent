# Devpost submission text

**Name:** Precedent
**Tagline:** Your team already decided this. Precedent remembers decisions and promises, and guards new Jira work against them.
**Category:** Apps for Software Teams · **Bonus:** Best Agents

## Inspiration

A payment team we modelled as "Nimbus Pay" had the same checkout outage twice. The first postmortem promised three fixes. One was done. Four months later the same failure came back. In the same year, a new engineer opened a story to move login to Firebase, a move the team had rejected in March for data residency reasons. Nobody remembered. The knowledge existed; it just sat in pages nobody reread.

## What it does

- **Extracts** decisions and promises from Confluence pages, post-incident reviews and Jira comments, each with the exact source quote, owner and date. It never invents: an item without a verifiable quote is dropped.
- **Guards** new work. When a Jira work item or JSM incident is created or edited, the Precedent panel shows **Conflict** (goes against an accepted decision), **Déjà vu** (looks like a past incident whose promised fixes are still open) or **Open promise**, always with the source link, quote, who and when.
- **Tracks** promises in a ledger with owner, due date and a live status synced from the linked Jira work item, and reports a promise keep rate.
- **Keeps history.** Decisions go proposed → accepted → superseded. Superseded decisions stay in the chain and stop raising flags.
- **Answers agents.** A Rovo agent and an MCP server give the same cited answers in chat and in coding tools.

## How we built it

Forge end to end, in strict TypeScript:

- **Modules:** `jira:issuePanel` (UI Kit), `jira:globalPage` and `jira:adminPage` (Custom UI, React + Vite), `confluence:contentBylineItem`, product triggers, a daily `scheduledTrigger`, two queue `consumer`s, `sql`, `llm`, `rovo:agent` with five `action`s, and `rovo:mcp`.
- **Storage:** Forge SQL for decisions, promises, incidents, flags, feedback, links and history. KVS only for settings and debounce markers.
- **AI:** Forge LLMs. A small model extracts and classifies; a larger one writes explanations. Outputs are strict JSON validated with zod, retried once, and cached by content hash.
- **Async:** triggers push to queues; consumers do the work. The UI reads the ledger only, so the panel opens instantly.
- **Guard pipeline:** cheap candidate retrieval (scope tags, keyword overlap, graph neighbours, top 15), then an LLM judge per candidate, then incident matching. Edits within 60 seconds are debounced. Thresholds: below 0.55 ignored, 0.55–0.80 panel only, above 0.80 optionally one comment.
- **Context:** the Teamwork Graph behind an interface, with a Jira REST fallback.

## How it meets the Forge requirement

The app is a Forge app and nothing else: no external servers, no egress, no secrets. Data stays in Forge SQL and KVS on Atlassian infrastructure. AI runs through the Forge `llm` module. It installs from a Forge distribution link.

## Best Agents bonus

The **Precedent** Rovo agent has five actions: `find-precedents`, `check-conflict`, `list-open-promises`, `explain-decision`, `supersede-decision`. Its prompt forces a citation (key, owner, date, link, quote) for everything it says and forbids answering from general knowledge. The same actions are exposed through `rovo:mcp`, and `docs/skill.md` teaches coding agents to check precedents before they write code. The agent is not a chat wrapper: it reads and writes the same ledger the guard uses, including the supersede lifecycle.

## Challenges

- **Precision.** A guard that cries wolf gets ignored. We built a 46-case labelled set with deliberately tricky pairs and added guard rails: cited quotes must exist in the decision text or confidence is capped.
- **Never invent.** Every extracted item is checked against the source text before it is stored, and extracted decisions start as proposed.
- **No dead ends.** One button loads a complete sample company on an empty site, and every AI path has a rule-based fallback.

## Accomplishments

- Rule-based fallback judge: precision 1.00, recall 0.80 on the labelled set, enforced by a test.
- 57 unit tests, including the real SQL migrations and repository running on a SQL engine.
- A ledger UI with its own identity that still follows Jira's light and dark themes.

## What we learned

Retrieval decides cost; the judge decides trust. And people accept a warning when it shows its source.

## What's next

Slack and Loom as sources, weekly digest of overdue promises to owners, decision templates for ADRs, and per-team keep rate trends.

## Built with

Atlassian Forge, Forge SQL, Forge LLMs, Rovo agents, Rovo MCP, Teamwork Graph, TypeScript, React, Vite, zod, vitest.

## Try it

Installation link: _add after `forge deploy` and enabling distribution_ · Testing guide: `TESTING.md` · Repository: this one.
