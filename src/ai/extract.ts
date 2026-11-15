import { quoteAppearsIn, normalizeWhitespace, truncate } from '../ledger/text';
import { completeJson, type LlmCache, type LlmClient } from './client';
import { EXTRACTION_SYSTEM, extractionUser } from './prompts/extraction';
import { ExtractionResult, type ExtractedDecisionT, type ExtractedPromiseT, type ExtractionResultT } from './schemas';

export interface SectionInput {
  sourceTitle: string;
  sourceDate: string | null;
  heading: string;
  text: string;
}

/** Drop anything whose quote is not really in the source, and anything below the confidence floor. */
export function groundExtraction(result: ExtractionResultT, sourceText: string, minConfidence = 0.6): ExtractionResultT {
  return {
    decisions: result.decisions.filter((d) => d.confidence >= minConfidence && quoteAppearsIn(d.quote, sourceText)),
    promises: result.promises.filter((p) => p.confidence >= minConfidence && quoteAppearsIn(p.quote, sourceText)),
  };
}

const DECISION_LINE =
  /\b(we (?:have )?decided|decision:|we will not|we won't|we will no longer|we chose|we are going with|going forward,? we|the team agreed|agreed to|we reject(?:ed)?)\b/i;
const PROMISE_LINE = /^(?:-\s*)?(?:\[ ?\]\s*)?(?:action item|ai|todo|follow[- ]?up)s?\s*[:\-–]|\bowner\s*:|\bwe (?:commit|promise) to\b/i;
const KEY = /\b([A-Z][A-Z0-9]+-\d+)\b/;
const DATE = /\b(\d{4}-\d{2}-\d{2})\b/;
const OWNER = /\b(?:[Oo]wner|[Aa]ssignee)\s*[:=]\s*([A-Z][a-z]+(?: [A-Z][a-z]+)?)|@([A-Z][a-z]+(?: [A-Z][a-z]+)?)|\(([A-Z][a-z]+(?: [A-Z][a-z]+)?)\)/;

/**
 * Conservative rule-based extractor used when Forge LLMs are unavailable.
 * It only returns verbatim lines, so it can never invent content.
 */
export function heuristicExtract(input: SectionInput): ExtractionResultT {
  const decisions: ExtractedDecisionT[] = [];
  const promises: ExtractedPromiseT[] = [];
  for (const raw of input.text.split('\n')) {
    const line = normalizeWhitespace(raw.replace(/^-\s*/, ''));
    if (line.length < 12) continue;
    if (PROMISE_LINE.test(raw.trim())) {
      const owner = OWNER.exec(line);
      const statement = line.replace(PROMISE_LINE, '').replace(/\s+/g, ' ').trim();
      if (statement.length < 6) continue;
      promises.push({
        statement: truncate(statement, 600),
        owner_name: owner ? owner[1] ?? owner[2] ?? owner[3] ?? null : null,
        due_date: DATE.exec(line)?.[1] ?? null,
        linked_issue_key: KEY.exec(line)?.[1] ?? null,
        scope_tags: [],
        quote: truncate(line, 1200),
        confidence: 0.7,
      });
    } else if (DECISION_LINE.test(line)) {
      const title = truncate(line.replace(/^(decision:\s*)/i, ''), 120);
      decisions.push({
        title,
        statement: truncate(line, 1200),
        rationale: '',
        alternatives_rejected: [],
        scope_tags: [],
        owner_name: OWNER.exec(line)?.[1] ?? null,
        decided_at: DATE.exec(line)?.[1] ?? input.sourceDate,
        status: /\bpropos/i.test(line) ? 'proposed' : 'accepted',
        quote: truncate(line, 1200),
        confidence: 0.65,
      });
    }
  }
  return { decisions: decisions.slice(0, 20), promises: promises.slice(0, 30) };
}

export async function extractSection(
  input: SectionInput,
  deps: { llm?: LlmClient | null; cache?: LlmCache },
): Promise<ExtractionResultT & { method: 'llm' | 'heuristic' }> {
  const sourceText = input.heading + '\n' + input.text;
  if (!deps.llm) return { ...groundExtraction(heuristicExtract(input), sourceText), method: 'heuristic' };
  try {
    const res = await completeJson(deps.llm, ExtractionResult, 'small', EXTRACTION_SYSTEM, extractionUser(input), deps.cache, 2500);
    return { ...groundExtraction(res, sourceText), method: 'llm' };
  } catch {
    return { ...groundExtraction(heuristicExtract(input), sourceText), method: 'heuristic' };
  }
}
