// Just enough Markdown for the training docs in training/: headings, paragraphs, lists with
// one level of nesting, tables, quotes, rules, **bold** and `code`. Our own files, so no
// HTML, links or escapes to worry about — and no dependency to ship for it.

export type Inline = { kind: 'text' | 'bold' | 'code'; text: string };

export interface ListItem { text: string; children?: MdList }
export interface MdList { ordered: boolean; items: ListItem[] }

export type Block =
  | { type: 'heading'; level: number; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; lines: string[] }
  | { type: 'rule' }
  | { type: 'table'; head: string[]; rows: string[][] }
  | ({ type: 'list' } & MdList);

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^(-{3,}|\*{3,})\s*$/;
const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

/** A stable anchor for a heading ("## 2. Автомобили" → "2-автомобили"). */
export const slug = (text: string) =>
  text.toLowerCase().replace(/[*`]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'paragraph', text: para.join(' ') }); para = []; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { flush(); continue; }

    const h = line.match(HEADING);
    if (h) { flush(); blocks.push({ type: 'heading', level: h[1].length, text: h[2].trim(), id: slug(h[2]) }); continue; }

    if (RULE.test(line)) { flush(); blocks.push({ type: 'rule' }); continue; }

    if (line.startsWith('>')) {
      flush();
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      i--;
      blocks.push({ type: 'quote', lines: quote.filter(q => q.trim()) });
      continue;
    }

    if (line.trimStart().startsWith('|')) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) rows.push(cells(lines[i++]));
      i--;
      const [head, ...rest] = rows;
      const body = rest.filter(r => !r.every(c => /^:?-{3,}:?$/.test(c))); // drop the |---| separator
      blocks.push({ type: 'table', head, rows: body });
      continue;
    }

    const li = line.match(LIST_ITEM);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const list: MdList = { ordered, items: [] };
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM);
        if (!m) break;
        const nested = m[1].length >= 2;
        const itemOrdered = /\d/.test(m[2]);
        if (nested && list.items.length) {
          const parent = list.items[list.items.length - 1];
          parent.children ??= { ordered: itemOrdered, items: [] };
          parent.children.items.push({ text: m[3] });
        } else if (!nested && itemOrdered === ordered) {
          list.items.push({ text: m[3] });
        } else break;
        i++;
      }
      i--;
      blocks.push({ type: 'list', ...list });
      continue;
    }

    para.push(line.trim());
  }
  flush();
  return blocks;
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    out.push(m[1] != null ? { kind: 'bold', text: m[1] } : { kind: 'code', text: m[2] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}
