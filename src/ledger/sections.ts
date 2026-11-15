import { normalizeWhitespace, sha256 } from './text';

export interface Section {
  index: number;
  heading: string;
  text: string;
  hash: string;
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => {
      if (ENTITIES[m]) return ENTITIES[m] as string;
      const num = /^&#(\d+);$/.exec(m);
      return num ? String.fromCharCode(Number(num[1])) : m;
    });
}

/** Convert Confluence storage-format XHTML into readable text, keeping list items and paragraphs on their own lines. */
export function storageToText(xhtml: string): string {
  const withBreaks = xhtml
    .replace(/<ac:parameter[^>]*>[\s\S]*?<\/ac:parameter>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/tr|\/h[1-6]|\/blockquote|\/div)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<ri:user[^>]*ri:account-id="([^"]+)"[^>]*\/?>(?:<\/ri:user>)?/gi, ' @[$1] ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(withBreaks)
    .split('\n')
    .map((l) => normalizeWhitespace(l))
    .filter(Boolean)
    .join('\n');
}

/**
 * Split a Confluence page (storage format) into sections at h1–h3 headings.
 * Each section gets a content hash so unchanged sections can be skipped on re-scan.
 */
export function splitStorage(xhtml: string, maxChars = 6000): Section[] {
  const parts = xhtml.split(/(?=<h[1-3][^>]*>)/i);
  const sections: Section[] = [];
  for (const part of parts) {
    const headingMatch = /^<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(part);
    const heading = headingMatch ? normalizeWhitespace(storageToText(headingMatch[1] ?? '')) : '';
    const body = storageToText(headingMatch ? part.slice(headingMatch[0].length) : part);
    if (!body && !heading) continue;
    for (const chunk of chunkText(body, maxChars)) {
      const text = chunk;
      sections.push({ index: sections.length, heading, text, hash: sha256(heading + '\n' + text) });
    }
  }
  return sections;
}

/** Split plain text (e.g. a Jira comment or PIR) into sections by markdown-ish headings. */
export function splitPlain(text: string, maxChars = 6000): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let heading = '';
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) {
      for (const chunk of chunkText(body, maxChars)) {
        sections.push({ index: sections.length, heading, text: chunk, hash: sha256(heading + '\n' + chunk) });
      }
    }
    buf = [];
  };
  for (const line of lines) {
    const h = /^\s*#{1,3}\s+(.+)$/.exec(line);
    if (h) {
      flush();
      heading = (h[1] ?? '').trim();
    } else buf.push(line);
  }
  flush();
  return sections;
}

function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return text ? [text] : [];
  const out: string[] = [];
  let current = '';
  for (const para of text.split('\n')) {
    if ((current + '\n' + para).length > maxChars && current) {
      out.push(current);
      current = para;
    } else current = current ? current + '\n' + para : para;
  }
  if (current) out.push(current);
  return out;
}

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
}

/** Flatten Atlassian Document Format (Jira descriptions/comments) to text. */
export function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return typeof node === 'string' ? node : '';
  const n = node as AdfNode;
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'mention') return String(n.attrs?.text ?? '');
  if (n.type === 'hardBreak') return '\n';
  const inner = (n.content ?? []).map(adfToText).join('');
  if (n.type === 'heading') return '\n# ' + inner + '\n';
  if (n.type === 'paragraph') return inner + '\n';
  if (n.type === 'listItem') return '- ' + inner.trim() + '\n';
  return inner;
}
