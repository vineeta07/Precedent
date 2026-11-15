import { describe, expect, it } from 'vitest';
import { keywordSet, overlap, quoteAppearsIn, sha256, stem, tokenize, truncate } from '../../src/ledger/text';
import { adfToText, splitPlain, splitStorage, storageToText } from '../../src/ledger/sections';

describe('text', () => {
  it('tokenizes, drops stopwords and stems', () => {
    expect(tokenize('We will not move the Queues to Firebase')).toEqual(['move', 'queue', 'firebase']);
    expect(stem('policies')).toBe('policy');
    expect(stem('migrating')).toBe('migrat');
  });
  it('overlap is 0 for empty sets and 1 for a subset', () => {
    expect(overlap(new Set(), keywordSet('a b'))).toBe(0);
    expect(overlap(keywordSet('firebase auth'), keywordSet('move auth to firebase now'))).toBe(1);
  });
  it('verifies quotes loosely but never accepts invented text', () => {
    const src = 'We decided NOT to move authentication to Firebase — data residency.';
    expect(quoteAppearsIn('we decided not to move authentication to firebase', src)).toBe(true);
    expect(quoteAppearsIn('We decided to move authentication to Firebase', src)).toBe(false);
    expect(quoteAppearsIn('short', src)).toBe(false);
  });
  it('hashes deterministically and truncates', () => {
    expect(sha256('a')).toBe(sha256('a'));
    expect(sha256('a')).not.toBe(sha256('b'));
    expect(truncate('abcdefgh', 5)).toBe('abcd…');
  });
});

describe('sections', () => {
  const page = '<h1>ADR</h1><p>Intro &amp; context</p><h2>Decision</h2><p>We decided X.</p><ul><li>Item one</li><li>Item two</li></ul>';
  it('splits storage format at headings with stable hashes', () => {
    const a = splitStorage(page);
    expect(a.map((s) => s.heading)).toEqual(['ADR', 'Decision']);
    expect(a[1]?.text).toContain('- Item one');
    expect(a[0]?.text).toBe('Intro & context');
    expect(splitStorage(page).map((s) => s.hash)).toEqual(a.map((s) => s.hash));
  });
  it('changing one section changes only that hash', () => {
    const a = splitStorage(page);
    const b = splitStorage(page.replace('We decided X.', 'We decided Y.'));
    expect(b[0]?.hash).toBe(a[0]?.hash);
    expect(b[1]?.hash).not.toBe(a[1]?.hash);
  });
  it('keeps user mentions and strips macros parameters', () => {
    expect(storageToText('<p>Owner <ri:user ri:account-id="abc123"/></p>')).toContain('@[abc123]');
  });
  it('splits plain text by markdown headings and chunks long text', () => {
    expect(splitPlain('# One\nhello\n# Two\nworld').map((s) => s.heading)).toEqual(['One', 'Two']);
    expect(splitPlain(Array.from({ length: 50 }, () => 'x'.repeat(200)).join('\n'), 1000).length).toBeGreaterThan(5);
  });
  it('flattens ADF', () => {
    const adf = { type: 'doc', content: [{ type: 'heading', content: [{ type: 'text', text: 'Title' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] };
    expect(adfToText(adf)).toContain('# Title');
    expect(adfToText(adf)).toContain('Body');
    expect(adfToText(null)).toBe('');
  });
});
