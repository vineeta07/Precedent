---
name: check-precedents-before-you-code
description: Before starting or proposing engineering work, check the team's Precedent ledger for earlier decisions and open promises that apply.
---

# Check precedents before you code

Use this whenever you are about to plan, design or implement a change for a team that uses Precedent.

## When

- Before writing code for a new work item.
- Before proposing a new tool, vendor, database, protocol or architecture.
- When investigating an incident.

## Steps

1. Call `check-conflict` with the work item key, or a one-sentence description of the plan.
2. If the verdict is a conflict: stop. Tell the user which decision it conflicts with, quoting the source and naming the owner and date. Do not work around it.
3. If the result is "related" or "revisits": continue, and mention the decision so the change follows it.
4. For incidents, call `find-precedents` with the symptom. If a past incident matches, list the promises that are still open before suggesting a fix.
5. If the user says the decision is out of date, ask for the new decision and the reason, confirm, then call `supersede-decision`. Never supersede on your own.

## Rules

- Cite every decision or promise with its key (DEC-n, PRM-n), owner, date, source link and exact quote.
- Never invent a decision. If nothing is found, say "No precedent found in the ledger".
- A superseded decision does not apply. Name its successor instead.

## Tools

`find-precedents` · `check-conflict` · `list-open-promises` · `explain-decision` · `supersede-decision`
