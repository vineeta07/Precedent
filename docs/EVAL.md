# Evaluation of the conflict judge

The guard must not cry wolf. We measure the **conflict** class on `tests/eval/conflicts.jsonl`: 46 hand-labelled pairs of (decision, new work item).

The set includes the tricky kinds on purpose:

- same words, no conflict ("Remove leftover Firebase Auth SDK" against "do not move to Firebase");
- conflict in completely different words ("Replicate the user profile table to the Virginia data centre" against an EU data residency decision);
- superseded decisions, which must never count;
- work that implements or enforces a decision;
- items that only share a generic word ("card", "timeout", "auth").

## Results

| Judge | Cases | Precision | Recall | F1 | Exact relation | Where it ran |
|---|---|---|---|---|---|---|
| Rule-based fallback, first version | 46 | 0.83 | 0.75 | 0.79 | 0.72 | offline, `npm run eval` |
| Rule-based fallback, current | 46 | **1.00** | **0.80** | 0.89 | 0.89 | offline, `npm run eval` |
| Forge LLM judge | 46 | not measured yet | | | | on a site: Settings → Diagnostics → Run AI accuracy test |

Precision is the share of raised conflicts that were real. Recall is the share of real conflicts that were caught. The bar is precision ≥ 0.85; `npm run eval` fails below it and a unit test enforces it.

The Forge LLM row is empty because Forge LLMs only run inside a deployed app, and this build has not been deployed to a site yet. The same 46 cases are bundled in the app, so the number can be read on any site from the Settings page.

## What changed between the two rule-based versions

1. A conflict needs evidence of the *forbidden thing*, not just shared words: a product name from the rejected alternatives (DynamoDB, Auth0, SQS), or at least 75% of a rejected phrase.
2. Scope words inside a negated sentence ("…for the payments ledger") are context, not the forbidden thing.
3. A summary that removes, audits or blocks the forbidden thing is compatible.
4. "Spike" inside a description no longer counts as re-opening a decision.

## Known misses of the rule-based judge

All four remaining misses are conflicts phrased in different words (c05, c11, c25, c45). That is the job of the LLM judge. The rule-based judge is the fallback and the offline baseline; it is deliberately tuned to stay quiet rather than guess.

## Guard rails around the LLM judge

- Output is strict JSON validated with zod; one retry with the validation error, then fallback to rules.
- The quote the model cites must appear in the decision text. If it does not, confidence is capped at 0.60, so it can never trigger a comment.
- Below 0.55 a finding is ignored; 0.55–0.80 shows in the panel only; above 0.80 may also post one comment if an admin enabled it.
