import React, { useMemo } from 'react';
import { parseMarkdown, parseInline, Block, MdList } from '../miniMarkdown';

const Inline: React.FC<{ text: string }> = ({ text }) => (
  <>
    {parseInline(text).map((p, i) =>
      p.kind === 'bold' ? <strong key={i} className="font-bold text-white">{p.text}</strong>
        : p.kind === 'code' ? <code key={i} className="px-1 py-0.5 rounded bg-white/10 text-[0.9em] text-slate-200">{p.text}</code>
        : <React.Fragment key={i}>{p.text}</React.Fragment>
    )}
  </>
);

const List: React.FC<{ list: MdList; nested?: boolean }> = ({ list, nested }) => {
  const Tag = list.ordered ? 'ol' : 'ul';
  return (
    <Tag className={`${list.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1 marker:text-slate-500 ${nested ? 'mt-1' : ''}`}>
      {list.items.map((it, i) => (
        <li key={i} className="leading-relaxed">
          <Inline text={it.text} />
          {it.children && <List list={it.children} nested />}
        </li>
      ))}
    </Tag>
  );
};

const renderBlock = (b: Block, i: number) => {
  switch (b.type) {
    case 'heading': {
      const cls = b.level === 1 ? 'text-2xl font-extrabold text-white'
        : b.level === 2 ? 'text-lg font-bold text-white pt-4 border-t border-white/10'
        : 'text-base font-bold text-blue-200';
      return React.createElement(`h${Math.min(b.level + 1, 6)}`, { key: i, id: b.id, className: `${cls} scroll-mt-24` }, <Inline text={b.text} />);
    }
    case 'paragraph': return <p key={i} className="leading-relaxed"><Inline text={b.text} /></p>;
    case 'quote': return (
      <blockquote key={i} className="border-l-2 border-blue-500/50 bg-blue-500/5 rounded-r-xl px-4 py-2.5 space-y-1 text-slate-300">
        {b.lines.map((l, j) => <p key={j} className="leading-relaxed"><Inline text={l} /></p>)}
      </blockquote>
    );
    case 'rule': return <hr key={i} className="border-white/10" />;
    case 'table': return (
      <div key={i} className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[520px] text-[13px] border-collapse">
          <thead>
            <tr>{b.head.map((h, j) => <th key={j} className="text-left align-bottom font-bold text-slate-300 bg-white/5 border border-white/10 px-2.5 py-2"><Inline text={h} /></th>)}</tr>
          </thead>
          <tbody>
            {b.rows.map((r, j) => (
              <tr key={j}>{r.map((c, k) => <td key={k} className="align-top border border-white/10 px-2.5 py-2 leading-relaxed"><Inline text={c} /></td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    case 'list': return <List key={i} list={b} />;
  }
};

/** A training doc: an index of its sections, then the text. */
export const Markdown: React.FC<{ src: string }> = ({ src }) => {
  const blocks = useMemo(() => parseMarkdown(src), [src]);
  const sections = blocks.filter((b): b is Extract<Block, { type: 'heading' }> => b.type === 'heading' && b.level === 2);
  return (
    <div className="space-y-4 text-sm text-slate-300">
      {sections.length > 3 && (
        <nav className="flex flex-wrap gap-1.5">
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`} onClick={e => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-semibold text-slate-300 hover:text-white hover:border-blue-500/40 transition-colors">
              {s.text.replace(/\*\*/g, '')}
            </a>
          ))}
        </nav>
      )}
      {blocks.map(renderBlock)}
    </div>
  );
};
