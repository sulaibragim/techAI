import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, Check, ClipboardList, Upload, Globe, Sparkles, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { ServiceRate, ServiceCategory, SERVICE_CATEGORIES } from '../types';
import { DraftRate, PriceImportRow, parsePriceList, gridToText, buildImportRows, buildPlan, ImportPlan } from '../priceImport';
import { scanWebsitePrices, aiParsePriceText } from '../priceImportAI';
import { parseSpreadsheetFile } from '../spreadsheet';

// Bulk price import. Three ways in — paste a list, drop a file, or point at a web page —
// and one way out: a preview the owner can fix before anything touches the price book.
// Nothing is written until "Импортировать": a bad parse costs a glance, not a cleanup.

interface Props {
  existing: ServiceRate[];
  onCancel: () => void;
  onConfirm: (plan: ImportPlan) => void;
}

type Source = 'text' | 'file' | 'site';

const SOURCES: { key: Source; label: string; icon: React.ElementType }[] = [
  { key: 'text', label: 'Текст', icon: ClipboardList },
  { key: 'file', label: 'Файл', icon: Upload },
  { key: 'site', label: 'Сайт', icon: Globe },
];

const PLACEHOLDER = `Car lockout — 139
Home lockout $159, night $219
Lock rekey 149 за первую дверь
Автоключ с чипом 149

Можно вставить прямо из Excel или из переписки —
одна услуга на строку, цена в конце.`;

const inputCls = 'bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500/50 [&>option]:bg-slate-900';

export const PriceImport: React.FC<Props> = ({ existing, onCancel, onConfirm }) => {
  const [source, setSource] = useState<Source>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [rows, setRows] = useState<PriceImportRow[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [aiUsed, setAiUsed] = useState(false);

  const show = (drafts: DraftRate[]) => {
    const built = buildImportRows(drafts, existing);
    setRows(built);
    if (built.length === 0) setError('Ни одной строки с ценой не нашлось. Проверь, что в строке есть название и число.');
  };

  const parseText = (raw: string) => {
    setError(''); setAiUsed(false);
    show(parsePriceList(raw));
  };

  const runAiText = async () => {
    const raw = text.trim();
    if (!raw) return;
    setError(''); setBusy('ai');
    try {
      const drafts = await aiParsePriceText(raw);
      setAiUsed(true);
      show(drafts);
    } catch (e: any) {
      setError(e?.message || 'ИИ не смог разобрать список.');
    } finally {
      setBusy('');
    }
  };

  const handleFile = async (file: File) => {
    setError(''); setBusy('file'); setAiUsed(false);
    try {
      // A plain text list needs no spreadsheet parser at all.
      if (/\.(txt|md)$/i.test(file.name)) {
        const raw = await file.text();
        setText(raw);
        show(parsePriceList(raw));
        return;
      }
      const sheets = await parseSpreadsheetFile(file);
      // A workbook can hold a price sheet next to four other things — take whichever
      // sheet yields the most priced services.
      const best = sheets
        .map(s => ({ name: s.name, drafts: parsePriceList(gridToText(s.rows)) }))
        .sort((a, b) => b.drafts.length - a.drafts.length)[0];
      if (!best || best.drafts.length === 0) {
        setRows([]);
        setError('В файле не нашлось строк «услуга — цена».');
        return;
      }
      show(best.drafts);
    } catch (e: any) {
      setError('Не удалось прочитать файл: ' + (e?.message || 'ошибка'));
    } finally {
      setBusy('');
    }
  };

  const runSite = async () => {
    const link = url.trim();
    if (!link) return;
    setError(''); setBusy('site');
    try {
      const drafts = await scanWebsitePrices(/^https?:\/\//i.test(link) ? link : `https://${link}`);
      setAiUsed(true);
      show(drafts);
    } catch (e: any) {
      setError(e?.message || 'Не удалось прочитать страницу.');
    } finally {
      setBusy('');
    }
  };

  const patch = (key: string, p: Partial<PriceImportRow>) =>
    setRows(rs => (rs ? rs.map(r => (r.key === key ? { ...r, ...p } : r)) : rs));

  const included = rows?.filter(r => r.include) || [];
  const newCount = included.filter(r => !r.existingId).length;
  const updCount = included.length - newCount;
  const changedCount = included.filter(r => r.existingId && r.oldPrice !== r.price).length;

  const plan = useMemo(() => (rows ? buildPlan(rows, existing) : null), [rows, existing]);

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={onCancel}>
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-white/10 rounded-t-3xl md:rounded-3xl w-full md:max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 bg-slate-900 border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ClipboardList size={18} className="text-blue-400" /> Импорт прайса
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-white p-1"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {SOURCES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setSource(key); setError(''); }}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-bold transition-all ${source === key ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          {source === 'text' && (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={8}
                placeholder={PLACEHOLDER}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 font-mono leading-relaxed"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => parseText(text)}
                  disabled={!text.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  Разобрать
                </button>
                <button
                  onClick={runAiText}
                  disabled={!text.trim() || !!busy}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-purple-600/20 border border-purple-500/40 text-purple-200 hover:bg-purple-600/30 disabled:opacity-40"
                >
                  {busy === 'ai' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Через ИИ
                </button>
                <span className="text-[11px] text-slate-500">ИИ — если список кривой: абзацами, с описаниями, вперемешку.</span>
              </div>
            </div>
          )}

          {source === 'file' && (
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/15 rounded-2xl py-10 cursor-pointer hover:border-blue-500/40 hover:bg-white/5 transition-all">
              {busy === 'file' ? <Loader2 size={30} className="text-blue-400 animate-spin" /> : <Upload size={30} className="text-slate-400" />}
              <span className="text-sm font-semibold text-white">{busy === 'file' ? 'Читаю файл…' : 'Выбери файл: .txt, .csv или Excel'}</span>
              <span className="text-xs text-slate-500">Колонки «услуга» и «цена» найдутся сами</span>
              <input
                type="file" accept=".txt,.md,.csv,.tsv,.xlsx,.xls" className="hidden" disabled={!!busy}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
              />
            </label>
          )}

          {source === 'site' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runSite(); }}
                  placeholder="trustkeyaz.com/prices"
                  className="flex-1 min-w-0 bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50"
                  inputMode="url"
                />
                <button
                  onClick={runSite}
                  disabled={!url.trim() || !!busy}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  {busy === 'site' ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />} Прочитать
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Дай ссылку на страницу с ценами — свою или чужую. Дурачок прочитает её и вытащит услуги с ценами.
                Страницу, где цены подгружаются скриптом, он не увидит — тогда скопируй текст во вкладку «Текст».
              </p>
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Проверь перед импортом{aiUsed && <span className="text-purple-300 normal-case"> · разобрано ИИ</span>}
                </p>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-400">
                    добавить <span className="text-green-400 font-bold">{newCount}</span> · обновить <span className="text-blue-400 font-bold">{updCount}</span>
                  </p>
                  <button
                    onClick={() => setRows(rs => (rs ? rs.map(r => ({ ...r, include: included.length !== rs.length })) : rs))}
                    className="text-[11px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-wider"
                  >
                    {included.length === rows.length ? 'Снять все' : 'Выбрать все'}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-[46vh] overflow-y-auto pr-1">
                {rows.map(r => (
                  // Two rows, not one: on a phone the name needs the full width, and
                  // squeezing it next to the price left it reading "Transpon…".
                  <div key={r.key} className={`bg-white/5 border border-white/10 rounded-xl px-2 py-2 space-y-1.5 ${r.include ? '' : 'opacity-40'}`}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => patch(r.key, { include: !r.include })}
                        aria-label={r.include ? 'Не импортировать' : 'Импортировать'}
                        className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${r.include ? 'bg-blue-600 border-blue-400 text-white' : 'border-white/20 text-transparent'}`}
                      >
                        <Check size={13} />
                      </button>
                      <input
                        value={r.name}
                        onChange={e => patch(r.key, { name: e.target.value })}
                        className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-white outline-none focus:bg-slate-950 rounded px-1"
                      />
                      <span className={`shrink-0 text-[10px] font-bold ${r.existingId ? 'text-blue-400' : 'text-green-400'}`}>
                        {!r.existingId
                          ? 'новая'
                          : r.oldPrice !== r.price
                            ? 'обновить'
                            : (r.oldNightPrice ?? null) !== (r.nightPrice ?? null)
                              ? 'ночная цена'
                              : 'без изменений'}
                      </span>
                      <button
                        onClick={() => setRows(rs => (rs ? rs.filter(x => x.key !== r.key) : rs))}
                        aria-label="Убрать строку"
                        className="shrink-0 text-slate-600 hover:text-red-400 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 pl-7">
                      <select
                        value={r.category}
                        onChange={e => patch(r.key, { category: e.target.value as ServiceCategory })}
                        className="shrink-0 bg-transparent text-[11px] text-slate-400 outline-none [&>option]:bg-slate-900 max-w-[130px]"
                      >
                        {SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span className="flex-1 min-w-0 truncate text-[11px]">
                        {r.note && <span className="text-slate-500">· {r.note}</span>}
                        {r.similarTo && (
                          <span className="text-amber-400/80" title="Похожая услуга уже есть — импорт создаст вторую">
                            {' '}· похоже на «{r.similarTo}»
                          </span>
                        )}
                      </span>
                      {r.existingId && r.oldPrice !== r.price && (
                        <span className="shrink-0 text-[11px] text-slate-500 line-through tabular-nums">${r.oldPrice}</span>
                      )}
                      <span className="shrink-0 text-slate-500 text-sm">$</span>
                      <input
                        type="number"
                        value={r.price}
                        onChange={e => patch(r.key, { price: Number(e.target.value) || 0 })}
                        className={`${inputCls} shrink-0 w-[74px] text-right font-mono text-green-400`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {changedCount > 0 && (
                <p className="text-[11px] text-amber-400/90">
                  Изменится действующих цен: {changedCount} — техники увидят новые сразу.
                </p>
              )}
            </div>
          )}
        </div>

        {rows && rows.length > 0 && (
          <div className="sticky bottom-0 bg-slate-900 border-t border-white/10 px-5 py-3 flex items-center justify-end gap-3">
            <button onClick={onCancel} className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white">Отмена</button>
            <button
              onClick={() => plan && onConfirm(plan)}
              disabled={included.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Check size={15} /> Импортировать {included.length}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
