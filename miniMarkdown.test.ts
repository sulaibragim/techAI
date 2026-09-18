import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMarkdown, parseInline, slug } from './miniMarkdown';

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, rules and quotes', () => {
    const blocks = parseMarkdown('# Title\n\nOne line\nsame paragraph\n\n---\n\n> quoted\n> more');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Title', id: 'title' },
      { type: 'paragraph', text: 'One line same paragraph' },
      { type: 'rule' },
      { type: 'quote', lines: ['quoted', 'more'] },
    ]);
  });

  it('reads a table without its separator row', () => {
    const [t] = parseMarkdown('| A | B |\n|---|---|\n| 1 | **2** |\n| 3 | 4 |');
    expect(t).toEqual({ type: 'table', head: ['A', 'B'], rows: [['1', '**2**'], ['3', '4']] });
  });

  it('nests an indented list under the item above it', () => {
    const [list] = parseMarkdown('1. First\n2. Second:\n   - a\n   - b\n3. Third');
    expect(list).toEqual({
      type: 'list', ordered: true, items: [
        { text: 'First' },
        { text: 'Second:', children: { ordered: false, items: [{ text: 'a' }, { text: 'b' }] } },
        { text: 'Third' },
      ],
    });
  });

  it('keeps a bullet list and a numbered list apart', () => {
    const blocks = parseMarkdown('- x\n- y\n1. one');
    expect(blocks.map(b => b.type === 'list' && b.ordered)).toEqual([false, true]);
  });

  it('parses every training doc into something readable', () => {
    for (const f of ['training/00-about.md', 'training/00-about.en.md', 'training/01-knowledge-base.md', 'training/02-call-scripts.md', 'training/03-never-say.md']) {
      const blocks = parseMarkdown(readFileSync(f, 'utf8'));
      expect(blocks.filter(b => b.type === 'heading').length, f).toBeGreaterThan(2);
      expect(blocks.filter(b => b.type === 'table').length, f).toBeGreaterThan(0);
      for (const b of blocks) if (b.type === 'table') for (const r of b.rows) expect(r.length, `${f}: ${r.join('|')}`).toBe(b.head.length);
    }
  });
});

describe('parseInline', () => {
  it('splits bold and code out of the text', () => {
    expect(parseInline('Say **$139 total**, see `pricing.md`.')).toEqual([
      { kind: 'text', text: 'Say ' },
      { kind: 'bold', text: '$139 total' },
      { kind: 'text', text: ', see ' },
      { kind: 'code', text: 'pricing.md' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('makes anchors from Russian headings', () => {
    expect(slug('2. Автомобили')).toBe('2-автомобили');
    expect(slug('**Цена:** $139')).toBe('цена-139');
  });
});
