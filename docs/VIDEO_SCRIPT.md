# Demo video script (target 3:40, hard limit 4:00)

Record at 1440×900, Jira light theme, browser zoom 100%. Have the sample data loaded with a Jira project and a Confluence space selected.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:15 | Precedent home page, hero. Slow scroll to the Nimbus Pay story card. | "Nimbus Pay had the same outage twice. The fix was promised in the postmortem. Nobody did it." |
| 0:15–0:40 | Keep scrolling: three pillars, then how it works. | "Every team has this problem. Decisions live in Confluence pages nobody rereads. Action items from postmortems quietly die. Months later the same idea, or the same incident, comes back. Precedent is a Forge app that remembers decisions and promises, and checks new work against them." |
| 0:40–1:25 | Jira: create work item "Migrate customer login to Firebase Auth". Open it. Precedent panel appears. | "A developer opens a story to move login to Firebase. Seconds later the panel says: conflicts with one decision. Here is the decision, DEC-12, the exact quote from the ADR, who decided, Priya, and when, in March. One click opens the source page." Click **View source**. Back. "If the decision really changed, I say so here, and the old one is superseded, never deleted." |
| 1:25–2:05 | Open the incident "Checkout timing out for card payments". | "Now an incident. Precedent recognises it: looks like INC-214, and two of the three fixes promised after that outage were never done. That is the alert on pool saturation, owned by Tom, due in August." |
| 2:05–2:45 | Apps → Precedent → Overview. Hover the chart. Open Decisions → DEC-14 drawer (chain). Promises filter "Broken". | "The Promise Ledger shows it all. Fourteen decisions, a keep rate of 64 percent, and exactly which promises are overdue. Each decision keeps its rationale, the rejected alternatives and its supersede chain." |
| 2:45–3:05 | Confluence page ADR-012, click the Precedent byline, Confirm. | "Nothing is typed in by hand. Precedent reads the page and proposes; a person confirms on the page itself." |
| 3:05–3:25 | Claude Desktop (or Rovo chat): "Check Precedent before I start: can we move customer login to Firebase Auth?" | "The same memory is available to agents. In Rovo, or from a desktop AI client over MCP, the answer comes back with the same citation." |
| 3:25–3:40 | Architecture slide (diagram from README). | "It runs entirely on Forge: triggers and queues, Forge SQL for the ledger, Forge LLMs for extraction and judging, a Rovo agent and an MCP server. The UI never waits on a model, and nothing is flagged without a source. Precedent: stop deciding the same thing twice." |

## Before recording

- [ ] Sample data loaded with project and space selected; note the three work item keys.
- [ ] Delete and re-create the Firebase work item live so the panel appears on camera.
- [ ] Settings → Diagnostics shows AI models available.
- [ ] MCP client connected and the five tools listed.
- [ ] Hide bookmarks bar; close other tabs.
