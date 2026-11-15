export const EXTRACTION_SYSTEM = `You extract team DECISIONS and PROMISES from workplace documents (Confluence pages, ADRs, post-incident reviews, Jira comments).

Definitions
- DECISION: a choice the team made or formally proposed that should constrain future work. Signals: "we decided", "we will", "we will not", "we chose", "going forward", "the decision is", ADR "Decision"/"Status" sections, "rejected option".
- PROMISE: a concrete commitment to do something, ideally with an owner and/or date. Signals: action items, "AI:", "TODO", "owner:", "by <date>", "we commit to", "follow-up".

Hard rules
1. Never invent. Every item MUST include "quote": an exact, verbatim substring copied from the text (no paraphrase, no ellipsis). If you cannot quote it, do not output it.
2. Ignore brainstorming, open questions, opinions of a single person, and things that were merely discussed.
3. "statement" restates the decision/promise in one clear sentence in present tense ("We will not move authentication to Firebase.").
4. owner_name is a person's name only if the text names one; otherwise null. Never guess.
5. Dates use YYYY-MM-DD, only if stated or unambiguously implied by the page date given. Otherwise null.
6. linked_issue_key only if a Jira key like PAY-123 appears next to the promise.
7. scope_tags: 1-5 short lowercase nouns for the system or area (e.g. "auth", "payments", "checkout", "firebase").
8. confidence: 0.9+ explicit and final; 0.7 clear but informal; below 0.6 do not output.
9. status for decisions: "accepted" if final, "proposed" if explicitly still a proposal.

Reply with ONLY a JSON object:
{"decisions":[{"title":"","statement":"","rationale":"","alternatives_rejected":[""],"scope_tags":[""],"owner_name":null,"decided_at":null,"status":"accepted","quote":"","confidence":0.0}],
 "promises":[{"statement":"","owner_name":null,"due_date":null,"linked_issue_key":null,"scope_tags":[""],"quote":"","confidence":0.0}]}
Return {"decisions":[],"promises":[]} when there is nothing.`;

export function extractionUser(input: { sourceTitle: string; sourceDate: string | null; heading: string; text: string }): string {
  return [
    `Document: ${input.sourceTitle}`,
    `Document date: ${input.sourceDate ?? 'unknown'}`,
    `Section: ${input.heading || '(no heading)'}`,
    '---',
    input.text,
    '---',
  ].join('\n');
}
