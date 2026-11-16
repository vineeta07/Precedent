# Testing Precedent (for judges)

You need a Jira site (Confluence optional). Everything works on an empty site. Budget: 5 minutes.

## 1. Install

Use the installation link from the submission, choose your site, and install for **Jira**. Run the link again and install for **Confluence** if you want the page byline and real source pages.

## 2. Load the sample company (30 seconds)

1. In Jira open **Apps → Precedent**. You land on the home page; scroll to see what the app does.
2. Open **Settings** in the left sidebar (Jira admins only).
3. Under **1 · Try it with the sample company**, optionally pick a Jira project and a Confluence space, then press **Load sample data (Nimbus Pay demo)**.
   - With no project chosen, only the ledger is filled. That is enough for the dashboard.
   - With a project chosen, six real work items are created so the Jira panel shows live results. The banner lists their keys.

## 3. See the guard work

| Open this | You should see |
|---|---|
| The work item "Migrate customer login to Firebase Auth" | Precedent panel: **⚠ Conflicts with 1 decision**, card DEC-12 with the quote "We decided NOT to move authentication to Firebase", owner Priya Raman, 12 Mar 2026 |
| The work item "Checkout timing out for card payments" | **↺ Looks like INC-214 — 2 promises still open**, with PRM-32 and PRM-33 |
| The work item "Add dark mode to the merchant dashboard" | **✓ No precedents found** |

Try the buttons: **Not related** dismisses a card for good. **Decision changed** supersedes the decision and keeps the chain.

Create your own work item, for example "Store ledger entries in DynamoDB". Within about ten seconds the panel shows a conflict with DEC-7. Edits are re-checked about a minute later (edits within 60 seconds are grouped).

## 4. The ledger

**Apps → Precedent**: Overview (KPIs, keep rate), Decisions (open DEC-14 to see the supersede chain DEC-5 → DEC-14), Promises, Repeat incidents, Guard activity, User guide.

## 5. Your own content

Settings → **2 · Scan Confluence spaces**, select a space and press Scan. Progress is live. On a scanned Confluence page, click **Precedent** in the byline to confirm, edit or reject each decision.

A quick page to test with:

> ## Decision
> We decided not to use GraphQL for public APIs.
> ## Action items
> Action item: Publish the REST style guide. Owner: (your name). Due 2026-12-20.

## 6. The agent

Rovo chat → agent **Precedent** → "Did we already decide something about moving auth to Firebase?" The answer cites DEC-12 with owner, date and quote. For MCP clients see [docs/MCP.md](docs/MCP.md).

## 7. Health and accuracy

Settings → **Diagnostics** shows whether the database and AI models are available, and **Run AI accuracy test** scores the judge on labelled cases.

## If something looks empty

| Symptom | Cause and fix |
|---|---|
| Panel says the ledger is empty | Load the sample data or scan a space (step 2 or 5). |
| Panel shows nothing new right after an edit | Checks run in the background. Press **Check again**, wait ten seconds. |
| Settings says it is for administrators | Only Jira admins can change settings. Everything else is open to all users. |
| AI models show as unavailable | Precedent keeps working with its rule-based fallback; results are more conservative. |
| No Confluence spaces listed | Install the app for Confluence too, or use the sample data. |

To clean up: Settings → **Remove sample data**. Work items and pages created for the sample carry the label `precedent-sample` and can be deleted in Jira and Confluence.

## Without a site

```bash
npm install && npm run ui:install && npm run check && npm run ui:dev
```

Opens the full UI at http://127.0.0.1:5173 against data produced by the real pipeline. Add `?empty` to see the empty states and `?theme=dark` for dark mode.
