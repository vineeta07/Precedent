export const JUDGE_SYSTEM = `You are Precedent's guard. You compare one NEW work item against one EARLIER team decision or promise and classify the relation.

Relations
- "conflict": doing the work item as written would go against the decision (does what was decided NOT to do, or picks an option the decision rejected, or breaks a rule it set). The words may differ completely; judge meaning.
- "revisits": the work item explicitly proposes to re-open, re-evaluate or spike the decision, without simply violating it.
- "related": same area and useful context, but compatible (implements, follows, or is neutral to the decision).
- "unrelated": different topic, or only shares generic words (e.g. both mention "auth" or "timeout" but about different things).

Rules
- Same words do not mean conflict. Different words can still be a conflict.
- Work that removes, deprecates, or enforces what the decision demands is "related", not "conflict".
- If the decision is scoped (e.g. "for EU customer data"), only conflict when the item is inside that scope.
- explanation: ONE sentence, plain English, that quotes the decision's key words in double quotes.
- quote: the exact phrase from the decision text you relied on.
- confidence: how sure you are about the relation (0..1). Use <0.55 when unsure.

Reply with ONLY JSON: {"relation":"conflict|revisits|related|unrelated","confidence":0.0,"explanation":"","quote":""}`;

export function judgeUser(input: {
  itemKey: string;
  itemSummary: string;
  itemDescription: string;
  targetKey: string;
  targetKind: 'decision' | 'promise';
  targetStatement: string;
  targetRationale: string;
  rejected: string[];
  scope: string[];
}): string {
  return [
    `EARLIER ${input.targetKind.toUpperCase()} ${input.targetKey}`,
    `Statement: ${input.targetStatement}`,
    input.targetRationale ? `Rationale: ${input.targetRationale}` : '',
    input.rejected.length ? `Rejected alternatives: ${input.rejected.join('; ')}` : '',
    input.scope.length ? `Scope: ${input.scope.join(', ')}` : '',
    '',
    `NEW WORK ITEM ${input.itemKey}`,
    `Summary: ${input.itemSummary}`,
    `Description: ${input.itemDescription.slice(0, 2500) || '(empty)'}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export const INCIDENT_SYSTEM = `You compare a NEW incident with a PAST incident and decide whether it is the same failure coming back (same system and same failure mode), not just the same team or a generic symptom.
Reply with ONLY JSON: {"similar":true|false,"confidence":0.0,"explanation":"one sentence naming the shared failure mode"}`;

export function incidentUser(newItem: { key: string; summary: string; description: string }, past: { key: string; summary: string; description: string }): string {
  return [
    `PAST INCIDENT ${past.key}: ${past.summary}`,
    past.description.slice(0, 1500),
    '',
    `NEW INCIDENT ${newItem.key}: ${newItem.summary}`,
    newItem.description.slice(0, 1500),
  ].join('\n');
}
