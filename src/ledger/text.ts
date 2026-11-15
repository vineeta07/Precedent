import { createHash } from 'crypto';

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its ' +
    'just may me might more most must my no nor not of on once only or our out over own same she should so some such than ' +
    'that the their them then there these they this those through to too under until up very was we were what when where ' +
    'which while who whom why will with would you your about after again against all also am any because before being below ' +
    'between both down during each few further here itself let off other ourselves themselves yourselves us via per new ' +
    'add adds added use using used make makes need needs want wants work item task ticket issue story please team'
  ).split(/\s+/),
);

/** Very small suffix stemmer: good enough for keyword overlap, deterministic and testable. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 4 && /(x|z|ch|sh|ss)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 6 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith('ed')) w = w.slice(0, -2);
  if (w.length > 6 && w.endsWith('ation')) w = w.slice(0, -5);
  return w;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9\-_.]*[a-z0-9]|[a-z0-9]/g) ?? [])
    .map((t) => t.replace(/[._]/g, '-'))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

export function keywordSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** Overlap coefficient: |A∩B| / min(|A|,|B|). Robust when one side is short (a Jira summary). */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

export function sharedTerms(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const t of a) if (b.has(t)) out.push(t);
  return out;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Loose comparison used to verify that an LLM quote really appears in the source. */
export function normalizeForQuote(text: string): string {
  return normalizeWhitespace(
    text
      .toLowerCase()
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”‟]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/[^a-z0-9'"\- ]+/g, ' '),
  );
}

export function quoteAppearsIn(quote: string, source: string): boolean {
  const q = normalizeForQuote(quote);
  if (q.length < 8) return false;
  return normalizeForQuote(source).includes(q);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}
