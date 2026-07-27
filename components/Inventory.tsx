import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, Search, Plus, AlertCircle, RefreshCw, X, Minus, Trash2,
  Truck, ClipboardList, ChevronDown, Camera, ArrowDownLeft, ArrowUpRight, Pencil, TriangleAlert,
  ScanLine, Copy, CheckCircle2, ClipboardCheck, PieChart, Barcode, FileSpreadsheet, Wrench,
} from 'lucide-react';
import { useAppStore } from '../store';
import { useSettingsStore } from '../settingsStore';
import { useCurrentUser, can, useAuthStore } from '../authStore';
import { Part, StockMovement, MOVEMENT_META, PART_CATEGORY_SUGGESTIONS, PART_GROUP_SUGGESTIONS, isStockPart, shelfQty, heldOf, heldTotal } from '../types';
import { InvoiceImportModal, ReviewLine } from './InvoiceImport';
import { ExcelImport } from './ExcelImport';
import type { ImportRow, ImportTarget } from '../inventoryExcel';
import { StocktakeModal, InsightsModal } from './StockTools';
import { BarcodeScanner } from './BarcodeScanner';

const uniqSorted = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));

// Russian count agreement: 1 позиция / 2 позиции / 5 позиций.
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const marginPct = (price: number, cost?: number) => (cost && cost > 0 && price > 0 ? Math.round(((price - cost) / price) * 100) : null);
const monthKey = () => new Date().toISOString().slice(0, 7); // YYYY-MM

// Downscale a chosen image to a small JPEG thumbnail so part photos stay tiny in the synced blob.
async function fileToThumb(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = dataUrl;
  });
  const max = 320;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.7);
}

const inputCls = 'w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white outline-none focus:border-blue-500/50';
const labelCls = 'text-xs font-bold text-slate-400 uppercase tracking-widest pl-1';

export const Inventory: React.FC = () => {
  const {
    inventory, addInventoryItem, updateInventoryItem, removeInventoryItem,
    syncInventory, receiveStock, adjustStockTo, wipeInventory, transferToTech,
  } = useAppStore();
  const movements = useSettingsStore(s => s.stockMovements);
  const addExpense = useSettingsStore(s => s.addExpense);
  const setMovementDispute = useSettingsStore(s => s.setMovementDispute);
  const supplierAliases = useSettingsStore(s => s.supplierAliases);
  const importedInvoices = useSettingsStore(s => s.importedInvoices);
  const aiAvailable = useSettingsStore(s => s.aiAvailable);
  const learnSupplierAlias = useSettingsStore(s => s.learnSupplierAlias);
  const markInvoiceImported = useSettingsStore(s => s.markInvoiceImported);
  const addInventoryItemStore = useAppStore(s => s.addInventoryItem);

  const currentUser = useCurrentUser();
  const canEdit = currentUser ? can.editInventory(currentUser.role) : false;
  const isOwner = currentUser?.role === 'owner';
  const canHandOut = currentUser ? can.handOutStock(currentUser.role) : false;
  const isTech = currentUser?.role === 'technician';
  // Only active technicians can be handed stock — nobody else drives to a job with it.
  const users = useAuthStore(s => s.users);
  const techs = useMemo(
    () => users.filter(u => u.role === 'technician' && u.active !== false).map(u => ({ id: u.id, name: u.name })),
    [users]
  );

  const [syncing, setSyncing] = useState(false);
  const handleSync = async () => { setSyncing(true); try { await syncInventory(); } finally { setSyncing(false); } };

  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [wiping, setWiping] = useState(false);
  const [wipeResult, setWipeResult] = useState<{ ok: boolean; text: string } | null>(null);

  const handleWipe = async () => {
    if (wipeConfirm.trim().toUpperCase() !== 'ОБНУЛИТЬ') return;
    setWiping(true);
    setWipeResult(null);
    const res = await wipeInventory();
    setWiping(false);
    if (res.ok) {
      setWipeResult({ ok: true, text: `Готово — склад пустой. Удалено позиций: ${res.deleted ?? 0}.` });
      setTimeout(() => setWipeOpen(false), 1600);
    } else {
      setWipeResult({ ok: false, text: res.error || 'Не получилось. Склад не тронут.' });
    }
  };

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('All');
  const [groupFilter, setGroupFilter] = useState<string>('All');
  const [view, setView] = useState<'stock' | 'tools' | 'mine'>(isTech ? 'mine' : 'stock');

  const [isEditing, setIsEditing] = useState(false);
  const [editingPart, setEditingPart] = useState<Partial<Part>>({});
  const [showIds, setShowIds] = useState(false);

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveSeed, setReceiveSeed] = useState<{ partId: string; qty: string; cost: string }[] | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [stocktakeOpen, setStocktakeOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);

  // Barcode → part. Match by UPC (digits only); found → open its drawer, unknown →
  // open the New Item editor with the UPC pre-filled so the scan is never wasted.
  const handleBarcode = (raw: string) => {
    setBarcodeOpen(false);
    const digits = raw.replace(/\D/g, '');
    const hit = inventory.find(p => p.upc && p.upc.replace(/\D/g, '') === digits);
    if (hit) { setDrawerId(hit.id); return; }
    if (canEdit) {
      setShowIds(true);
      setEditingPart({ name: '', sku: '', category: '', stock: 0, reorderPoint: 0, price: 0, cost: 0, location: 'shop', upc: raw.trim() });
      setIsEditing(true);
    } else {
      setSearch(raw.trim());
    }
  };

  // Distinct supplier names seen in past receives — the datalist for the Receive modal.
  const knownSuppliers = useMemo(
    () => [...new Set(movements.map(m => (m.supplierName || '').trim()).filter(Boolean))].sort(),
    [movements]
  );

  // AI invoice confirmed: create any new parts, receive every line, learn the supplier
  // codes so the next invoice auto-matches, log ONE combined expense, stamp the invoice
  // number as imported (duplicate guard).
  const handleInvoiceConfirm = ({ supplier, invoiceNumber, lines }: { supplier: string; invoiceNumber: string; lines: ReviewLine[] }) => {
    const received: { partId: string; qty: number; cost: number; code: string }[] = [];
    for (const l of lines) {
      let partId = l.partId;
      if (l.createNew) {
        const p = addInventoryItemStore({
          name: l.description || l.code || 'New part',
          sku: (l.code || `NEW-${Date.now().toString().slice(-5)}`).toUpperCase(),
          category: 'Hardware',
          stock: 0,
          reorderPoint: 0,
          price: 0,
          cost: l.unitCost,
          mpn: l.code || undefined,
          location: 'shop',
        });
        partId = p.id;
      }
      if (!partId) continue;
      received.push({ partId, qty: l.qty, cost: l.unitCost, code: l.code });
    }
    received.forEach(r => receiveStock(r.partId, r.qty, r.cost, { supplierName: supplier, note: invoiceNumber ? `Invoice ${invoiceNumber}` : 'AI invoice import', logExpense: false }));
    const total = received.reduce((a, r) => a + r.qty * r.cost, 0);
    if (total > 0) {
      addExpense({
        date: new Date().toISOString().split('T')[0],
        category: 'Keys & Stock',
        amount: Math.round(total * 100) / 100,
        note: `Invoice${invoiceNumber ? ` ${invoiceNumber}` : ''}${supplier ? ` · ${supplier}` : ''} — ${received.length} line${received.length > 1 ? 's' : ''} (AI import)`,
        createdBy: currentUser?.id,
      });
    }
    if (supplier) received.forEach(r => { if (r.code) learnSupplierAlias(supplier, r.code, r.partId); });
    if (invoiceNumber) markInvoiceImported(invoiceNumber);
    setScanOpen(false);
  };

  // Excel import confirmed. Three different sheets, three different consequences:
  //
  //  'tools'    — equipment. Recorded as parts with kind 'tool' so they can never be billed
  //     to a client or counted as sellable stock, and rows that aren't marked bought land as
  //     a purchase plan (owned: false), not as something we have.
  //  'stock'    — consumables. 'set' overwrites the count (a shelf census, no expense);
  //     'receive' adds to it and logs ONE combined Keys & Stock expense.
  const handleExcelConfirm = (rows: ImportRow[], mode: 'receive' | 'set', target: ImportTarget) => {
    let spend = 0;
    for (const r of rows) {
      const isTool = target === 'tools';
      let partId = r.matchId;
      if (r.createNew) {
        const created = addInventoryItemStore({
          name: r.name,
          sku: (r.sku || `NEW-${Math.random().toString(36).slice(2, 7)}`).toUpperCase(),
          category: r.category || 'Прочее',
          group: r.group || undefined,
          kind: isTool ? 'tool' : 'stock',
          stock: 0,
          reorderPoint: r.reorderPoint,
          price: r.price,
          cost: r.cost || undefined,
          brand: r.brand || undefined,
          upc: r.barcode || undefined,
          location: 'shop',
          ...(isTool ? {
            owned: r.owned,
            serial: r.sku || undefined,
            warranty: r.warranty || undefined,
            purchasedAt: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : undefined,
            note: r.note || undefined,
          } : {}),
        });
        partId = created.id;
      } else if (partId) {
        // Keep the richer fields fresh on an existing part (reorder point, cost, brand).
        const existing = inventory.find(p => p.id === partId);
        if (existing) {
          updateInventoryItem({
            ...existing,
            reorderPoint: r.reorderPoint || existing.reorderPoint,
            cost: r.cost || existing.cost,
            brand: r.brand || existing.brand,
            category: r.category || existing.category,
            group: r.group || existing.group,
            ...(isTool ? { kind: 'tool' as const, owned: r.owned, warranty: r.warranty || existing.warranty, note: r.note || existing.note } : {}),
          });
        }
      }
      if (!partId) continue;
      // A tool we don't own yet is a plan — it must not appear as a unit on the shelf.
      if (isTool && !r.owned) { adjustStockTo(partId, 0, { note: 'План закупки (не куплено)' }); continue; }
      if (isTool || mode === 'set') {
        adjustStockTo(partId, r.stock, { note: isTool ? 'Импорт оборудования' : 'Excel import (установка остатка)' });
      } else if (r.stock > 0) {
        receiveStock(partId, r.stock, r.cost, { supplierName: r.supplier || undefined, note: 'Excel import (приход)', logExpense: false });
        spend += r.stock * (r.cost || 0);
      }
    }
    // Equipment money already sits in the purchase log — logging it here would double it.
    if (target === 'stock' && mode === 'receive' && spend > 0) {
      addExpense({
        date: new Date().toISOString().split('T')[0],
        category: 'Keys & Stock',
        amount: Math.round(spend * 100) / 100,
        note: `Excel import — ${rows.length} позиц.`,
        createdBy: currentUser?.id,
      });
    }
    setExcelOpen(false);
  };

  // Consumables, equipment and a shopping list are three different things and never mix:
  // stock value, the reorder list, the stocktake and the invoice picker all read `stockParts`.
  const stockParts = useMemo(() => inventory.filter(isStockPart), [inventory]);
  const allTools = useMemo(() => inventory.filter(p => p.kind === 'tool'), [inventory]);
  const toolParts = useMemo(() => allTools.filter(p => p.owned !== false), [allTools]);
  const plannedParts = useMemo(() => allTools.filter(p => p.owned === false), [allTools]);
  const myId = currentUser?.id || '';
  const myParts = useMemo(() => stockParts.filter(p => (heldOf(p)[myId] || 0) > 0), [stockParts, myId]);
  const shelf = view === 'mine' ? myParts : view === 'stock' ? stockParts : allTools;

  // Chips are derived from what's actually on the shelf (+ a few suggestions), so an
  // imported type like "транспондер" or platform like "Ford" appears without a fixed list.
  const categoryOptions = useMemo(
    () => uniqSorted([...inventory.map(p => p.category), ...PART_CATEGORY_SUGGESTIONS]),
    [inventory]
  );
  const groupOptions = useMemo(
    () => uniqSorted([...inventory.map(p => p.group || ''), ...PART_GROUP_SUGGESTIONS]),
    [inventory]
  );
  const filterChips = useMemo(() => uniqSorted(shelf.map(p => p.category)), [shelf]);
  const groupChips = useMemo(() => uniqSorted(shelf.map(p => p.group || '')), [shelf]);

  const filteredInventory = shelf.filter((part: Part) => {
    if (filter !== 'All' && part.category !== filter) return false;
    if (groupFilter !== 'All' && (part.group || '') !== groupFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hit = [part.name, part.sku, part.brand, part.mpn, part.upc, part.group].some(v => v?.toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });

  const inventoryAtCost = stockParts.reduce((a, p) => a + p.stock * (p.cost ?? 0), 0);
  const toolsAtCost = toolParts.reduce((a, p) => a + Math.max(1, p.stock) * (p.cost ?? 0), 0);
  const lowCount = stockParts.filter(p => p.stock <= p.reorderPoint).length;
  const lossThisMonth = useMemo(() => {
    const mk = monthKey();
    return movements
      .filter(m => m.timestamp.slice(0, 7) === mk && (m.type === 'loss' || (m.type === 'adjust' && m.qty < 0)))
      .reduce((a, m) => a + Math.abs(m.qty) * (m.unitCost ?? 0), 0);
  }, [movements]);

  const disputes = useMemo(() => movements.filter(m => m.disputed), [movements]);

  const drawerPart = drawerId ? inventory.find(p => p.id === drawerId) ?? null : null;

  const openEditor = (part?: Part) => {
    setShowIds(false);
    if (part) setEditingPart(part);
    else setEditingPart({ name: '', sku: '', category: '', stock: 0, reorderPoint: 0, price: 0, cost: 0, location: 'shop' });
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editingPart.name || !editingPart.sku) return;
    if (editingPart.id) {
      // Stock is managed via Receive / Count, never free-edited here — keep the existing count.
      const original = inventory.find(p => p.id === editingPart.id);
      updateInventoryItem({ ...(editingPart as Part), stock: original?.stock ?? editingPart.stock ?? 0 });
    } else {
      addInventoryItem(editingPart as Omit<Part, 'id'>);
    }
    setIsEditing(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Stock Operations</h2>
          <p className="text-slate-400 text-sm mt-1">Receive purchases, track cost &amp; margin, and watch every movement.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleSync} disabled={syncing} className="flex items-center space-x-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/10 transition-colors active:scale-95 disabled:opacity-60">
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Syncing…' : 'Sync'}</span>
          </button>
          <button onClick={() => setInsightsOpen(true)} title="ABC analysis & dead stock" className="flex items-center space-x-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/10 transition-colors active:scale-95">
            <PieChart size={16} />
            <span className="hidden lg:inline">Insights</span>
          </button>
          {canEdit && (
            <button onClick={() => setStocktakeOpen(true)} title="Count the shelf" className="flex items-center space-x-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/10 transition-colors active:scale-95">
              <ClipboardCheck size={16} />
              <span className="hidden lg:inline">Stocktake</span>
            </button>
          )}
          {canEdit && (
            <>
              <button onClick={() => openEditor()} className="flex items-center space-x-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm font-bold hover:bg-white/10 transition-colors active:scale-95">
                <Plus size={16} />
                <span>New Item</span>
              </button>
              <button onClick={() => setScanOpen(true)} className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-purple-500/20 hover:bg-purple-500 transition-colors active:scale-95">
                <ScanLine size={16} />
                <span>Scan Invoice</span>
              </button>
              <button onClick={() => setExcelOpen(true)} className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-green-500/20 hover:bg-green-500 transition-colors active:scale-95">
                <FileSpreadsheet size={16} />
                <span>Импорт Excel</span>
              </button>
              <button onClick={() => { setReceiveSeed(null); setReceiveOpen(true); }} className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-colors active:scale-95">
                <Truck size={16} />
                <span>Receive Stock</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* A disputed handover must not need someone to open every part to find it. */}
      {canHandOut && disputes.length > 0 && (
        <div className="bg-red-500/[0.07] border border-red-500/25 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-bold text-red-300 flex items-center gap-2">
            <TriangleAlert size={15} />
            Спорные выдачи: {disputes.length}
          </p>
          {disputes.slice(0, 4).map(m => (
            <button key={m.id} onClick={() => setDrawerId(m.partId)}
              className="w-full text-left text-xs text-slate-300 hover:text-white flex flex-wrap gap-x-2">
              <span className="font-semibold">{m.disputed?.byName}</span>
              <span className="text-slate-500">не получал</span>
              <span className="font-mono text-blue-300">{m.qty}×</span>
              <span className="truncate">{m.partName}</span>
              <span className="text-slate-600">{new Date(m.timestamp).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      )}

      {/* METRICS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 p-4 opacity-5"><Package size={40} /></div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Склад по закупке</p>
          <p className="text-2xl font-black text-white">{money(inventoryAtCost)}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
            {stockParts.length} позиц. · {stockParts.reduce((a, b) => a + b.stock, 0)} шт
          </p>
        </div>
        <button onClick={() => lowCount > 0 && setReorderOpen(true)} className={`bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 relative overflow-hidden shadow-lg text-left transition-all ${lowCount > 0 ? 'hover:bg-amber-500/15 active:scale-[0.98] cursor-pointer' : 'cursor-default'}`}>
          <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-500"><AlertCircle size={40} /></div>
          <p className="text-amber-500 text-xs font-bold uppercase tracking-widest mb-1">Low stock</p>
          <p className="text-2xl font-black text-amber-500">{lowCount}</p>
          {lowCount > 0 && <p className="text-[10px] font-bold text-amber-500/70 uppercase tracking-wider mt-0.5">Tap for reorder list →</p>}
        </button>
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-red-500"><TriangleAlert size={40} /></div>
          <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-1">Loss this month</p>
          <p className="text-2xl font-black text-red-400">{money(lossThisMonth)}</p>
        </div>
        {/* Equipment is an asset, not sellable stock — it gets its own number so it can
            never inflate what the shelf is worth. */}
        <button onClick={() => setView(view === 'tools' ? 'stock' : 'tools')}
          className={`bg-slate-900 border rounded-2xl p-5 relative overflow-hidden shadow-lg text-left transition-all ${view === 'tools' ? 'border-blue-500/50' : 'border-white/10 hover:bg-white/5'}`}>
          <div className="absolute top-0 right-0 p-4 opacity-5"><Wrench size={40} /></div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Оборудование</p>
          <p className="text-2xl font-black text-white">{money(toolsAtCost)}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
            {toolParts.length} ед.{plannedParts.length > 0 && ` · ${plannedParts.length} в плане`}
          </p>
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-slate-900 rounded-2xl border border-white/10 overflow-hidden shadow-xl">
        {/* Which of the three shelves we're looking at. Kept above the filters because it
            changes what the filters even contain. */}
        <div className="px-6 pt-5 flex gap-2 overflow-x-auto hide-scrollbar">
          {([
            ...(isTech ? [{ key: 'mine' as const, label: 'У меня', n: myParts.length }] : []),
            { key: 'stock' as const, label: isTech ? 'Весь склад' : 'Расходники', n: stockParts.length },
            { key: 'tools' as const, label: 'Инструмент', n: allTools.length },
          ]).map(v => (
            <button key={v.key} onClick={() => { setView(v.key); setFilter('All'); setGroupFilter('All'); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${view === v.key ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/10 text-slate-400 hover:text-white'}`}>
              {v.label} <span className="text-slate-500">{v.n}</span>
            </button>
          ))}
        </div>
        <div className="p-6 border-b border-white/10 flex flex-col md:flex-row gap-4 justify-between">
          <div className="space-y-2 min-w-0 flex-1">
            {groupChips.length > 1 && (
              <div className="flex bg-slate-950 border border-white/10 rounded-xl overflow-hidden p-1 w-full overflow-x-auto hide-scrollbar">
                {['All', ...groupChips].map(g => (
                  <button key={g} onClick={() => setGroupFilter(g)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${groupFilter === g ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
                    {g}
                  </button>
                ))}
              </div>
            )}
            <div className="flex bg-slate-950 border border-white/10 rounded-xl overflow-hidden p-1 w-full overflow-x-auto hide-scrollbar">
              {['All', ...filterChips].map(c => (
                <button key={c} onClick={() => setFilter(c)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${filter === c ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="relative w-full md:w-64 md:self-start">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="Search name, SKU, barcode…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl pl-10 pr-11 py-2.5 text-sm font-semibold text-white outline-none focus:border-blue-500/50 transition-colors" />
            <button onClick={() => setBarcodeOpen(true)} title="Scan a product barcode"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-white/5 transition-all">
              <Barcode size={16} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-950/50 border-b border-white/5 uppercase text-[10px] tracking-widest text-slate-500 font-bold">
                <th className="p-4 pl-6">Item</th>
                <th className="p-4 hidden md:table-cell">{view === 'stock' ? 'Марка / Тип' : 'Категория'}</th>
                <th className="p-4 text-right">{view === 'stock' ? 'Stock' : 'Кол-во'}</th>
                <th className="p-4 text-right hidden sm:table-cell">Cost</th>
                <th className="p-4 text-right">{view === 'stock' ? 'Price' : 'Гарантия'}</th>
                <th className="p-4 pr-6 text-right">{view === 'stock' ? 'Margin' : 'Куплено'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredInventory.map((item: Part) => {
                const isStock = isStockPart(item);
                const mine = heldOf(item)[myId] || 0;
                const handed = heldTotal(item);
                const isLow = isStock && item.stock <= item.reorderPoint;
                const mp = marginPct(item.price, item.cost);
                return (
                  <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={item.id}
                    onClick={() => setDrawerId(item.id)}
                    className={`cursor-pointer hover:bg-white/5 transition-colors ${isLow ? 'bg-amber-500/5' : ''}`}>
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        {item.photo
                          ? <img src={item.photo} alt="" className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0" />
                          : <div className="w-9 h-9 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center shrink-0"><Package size={15} className="text-slate-500" /></div>}
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{item.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono truncate">{item.sku}{item.upc ? ` · ${item.upc}` : ''}{item.location && item.location !== 'shop' ? <span className="text-purple-400/80"> · {item.location}</span> : null}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.group && <span className="bg-purple-500/15 text-purple-300 px-2.5 py-1 rounded-md text-xs font-bold">{item.group}</span>}
                        <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md text-xs font-bold">{item.category}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className={`font-mono text-sm ${isStock && isLow ? 'text-amber-500 font-bold' : 'text-slate-300'}`}>{item.stock}</span>
                      {isStock && <span className="text-[11px] text-slate-600 font-mono"> / {item.reorderPoint}</span>}
                      {isStock && mine > 0 && (
                        <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">у меня {mine}</p>
                      )}
                      {isStock && !isTech && handed > 0 && (
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">на полке {shelfQty(item)}</p>
                      )}
                    </td>
                    <td className="p-4 text-right font-mono text-sm text-slate-400 hidden sm:table-cell">{item.cost != null ? money(item.cost) : '—'}</td>
                    {isStock ? (
                      <>
                        <td className="p-4 text-right font-mono text-sm text-slate-300">{money(item.price)}</td>
                        <td className="p-4 pr-6 text-right font-mono text-sm">
                          {mp != null ? <span className={mp >= 0 ? 'text-green-400' : 'text-red-400'}>{mp}%</span> : <span className="text-slate-600">—</span>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-4 text-right text-xs text-slate-400 max-w-[160px] truncate">{item.warranty || '—'}</td>
                        <td className="p-4 pr-6 text-right text-xs font-mono text-slate-400">{item.purchasedAt || (item.owned === false ? <span className="text-amber-400 font-bold">план</span> : '—')}</td>
                      </>
                    )}
                  </motion.tr>
                );
              })}
              {filteredInventory.length === 0 && (
                <tr><td colSpan={6} className="p-12 text-center text-slate-400 text-sm font-semibold">No items match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* WIPE — owner only, and deliberately parked at the very bottom, far from the
          everyday buttons. Needed because the catalog could be poisoned from outside
          (a stale browser once seeded invented parts into the company database). */}
      {isOwner && inventory.length > 0 && (
        <div className="bg-red-500/[0.06] border border-red-500/20 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-red-300">Обнулить склад</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Удаляет все позиции ({inventory.length}) и журнал движений — на сервере и на всех устройствах.
              Задания, клиенты и деньги не тронутся. Дальше склад наполняется только приходом:
              фото чека, Excel или вручную.
            </p>
          </div>
          <button onClick={() => { setWipeConfirm(''); setWipeResult(null); setWipeOpen(true); }}
            className="shrink-0 flex items-center justify-center gap-2 bg-red-600/15 border border-red-500/40 text-red-300 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-red-600/25 transition-colors active:scale-95">
            <Trash2 size={16} />
            <span>Обнулить склад</span>
          </button>
        </div>
      )}

      <AnimatePresence>
        {wipeOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
              className="bg-slate-900 border border-red-500/30 rounded-3xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                  <TriangleAlert size={18} className="text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Обнулить склад</h3>
              </div>
              <p className="text-sm text-slate-400 mb-1">
                Будет удалено: <span className="font-bold text-white">{inventory.length}</span>
                {' '}{plural(inventory.length, 'позиция', 'позиции', 'позиций')}
                {' '}(<span className="font-bold text-white">{inventory.reduce((a, b) => a + b.stock, 0)}</span> шт)
                и <span className="font-bold text-white">{movements.length}</span>
                {' '}{plural(movements.length, 'запись', 'записи', 'записей')} журнала. Это не откатить.
              </p>
              <p className="text-xs text-slate-500 mb-5">Задания, клиенты, выручка и цены услуг остаются на месте.</p>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Впиши ОБНУЛИТЬ</label>
              <input autoFocus value={wipeConfirm} onChange={e => setWipeConfirm(e.target.value)}
                placeholder="ОБНУЛИТЬ"
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 mt-2 text-sm font-bold text-white outline-none focus:border-red-500/50" />
              {wipeResult && (
                <p className={`text-xs font-semibold mt-3 ${wipeResult.ok ? 'text-green-400' : 'text-red-400'}`}>{wipeResult.text}</p>
              )}
              <div className="flex gap-3 mt-5">
                <button onClick={() => setWipeOpen(false)}
                  className="flex-1 bg-white/5 border border-white/10 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-white/10 transition-colors">
                  Отмена
                </button>
                <button onClick={handleWipe} disabled={wipeConfirm.trim().toUpperCase() !== 'ОБНУЛИТЬ' || wiping}
                  className="flex-1 bg-red-600 py-3 rounded-xl text-sm font-bold text-white hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {wiping ? 'Обнуляю…' : 'Обнулить'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PART DRAWER — details + movement ledger + actions */}
      <AnimatePresence>
        {drawerPart && (
          <PartDrawer
            key={drawerPart.id}
            part={drawerPart}
            movements={movements.filter(m => m.partId === drawerPart.id)}
            canEdit={canEdit}
            onClose={() => setDrawerId(null)}
            onEdit={() => { setDrawerId(null); openEditor(drawerPart); }}
            onReceive={() => { setReceiveOpen(true); }}
            onCount={(actual) => adjustStockTo(drawerPart.id, actual, { type: 'adjust', note: 'Stocktake' })}
            onLoss={(qty, note) => adjustStockTo(drawerPart.id, drawerPart.stock - qty, { type: 'loss', note: note || 'Loss / broken' })}
            onDelete={() => { removeInventoryItem(drawerPart.id); setDrawerId(null); }}
            canHandOut={canHandOut && isStockPart(drawerPart)}
            techs={techs}
            onTransfer={(toUserId, qty) => transferToTech(drawerPart.id, toUserId, qty)}
            meId={myId}
            onDispute={(movementId, disputed) => setMovementDispute(
              movementId,
              disputed && currentUser ? { by: currentUser.id, byName: currentUser.name, at: new Date().toISOString() } : undefined
            )}
          />
        )}
      </AnimatePresence>

      {/* BARCODE SCAN → find part by UPC */}
      {barcodeOpen && <BarcodeScanner hint="Point at the product barcode (UPC)" onResult={handleBarcode} onClose={() => setBarcodeOpen(false)} />}

      {/* STOCKTAKE */}
      <AnimatePresence>
        {stocktakeOpen && (
          <StocktakeModal
            inventory={stockParts}
            onClose={() => setStocktakeOpen(false)}
            onApply={(changes) => changes.forEach(c => adjustStockTo(c.partId, c.actual, { type: 'adjust', note: 'Stocktake' }))}
          />
        )}
      </AnimatePresence>

      {/* INSIGHTS — ABC + dead stock */}
      <AnimatePresence>
        {insightsOpen && (
          <InsightsModal inventory={stockParts} movements={movements} onClose={() => setInsightsOpen(false)} />
        )}
      </AnimatePresence>

      {/* AI INVOICE SCAN */}
      <AnimatePresence>
        {scanOpen && (
          <InvoiceImportModal
            inventory={inventory}
            supplierAliases={supplierAliases}
            importedInvoices={importedInvoices}
            aiAvailable={aiAvailable}
            onClose={() => setScanOpen(false)}
            onConfirm={handleInvoiceConfirm}
          />
        )}
        {excelOpen && (
          <ExcelImport
            existing={inventory}
            onCancel={() => setExcelOpen(false)}
            onConfirm={handleExcelConfirm}
          />
        )}
      </AnimatePresence>

      {/* REORDER LIST */}
      <AnimatePresence>
        {reorderOpen && (
          <ReorderModal
            inventory={stockParts}
            movements={movements}
            canEdit={canEdit}
            onClose={() => setReorderOpen(false)}
            onReceive={(rows) => { setReorderOpen(false); setReceiveSeed(rows); setReceiveOpen(true); }}
          />
        )}
      </AnimatePresence>

      {/* RECEIVE MODAL */}
      <AnimatePresence>
        {receiveOpen && (
          <ReceiveModal
            inventory={stockParts}
            initialPartId={drawerPart?.id}
            initialRows={receiveSeed ?? undefined}
            knownSuppliers={knownSuppliers}
            onClose={() => { setReceiveOpen(false); setReceiveSeed(null); }}
            onSubmit={(rows, supplierName, logExpense) => {
              // Stock + per-part movements, but defer the expense to one combined entry below.
              rows.forEach(r => receiveStock(r.partId, r.qty, r.cost, { supplierName, logExpense: false }));
              if (logExpense) {
                const total = rows.reduce((a, r) => a + r.qty * r.cost, 0);
                addExpense({
                  date: new Date().toISOString().split('T')[0],
                  category: 'Keys & Stock',
                  amount: Math.round(total * 100) / 100,
                  note: `Stock purchase${supplierName ? ` · ${supplierName}` : ''} — ${rows.length} item${rows.length > 1 ? 's' : ''}`,
                  createdBy: currentUser?.id,
                });
              }
              setReceiveOpen(false);
              setReceiveSeed(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* EDITOR MODAL — CSS animation rather than AnimatePresence: this covers the whole
          screen, and an exit animation that never completes leaves it mounted with dead
          handlers, which looks like the app has frozen. */}
      {isEditing && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div
              className="bg-slate-900 border border-white/10 p-5 rounded-2xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              <button onClick={() => setIsEditing(false)} className="absolute top-6 right-6 text-slate-400 hover:text-white"><X size={20} /></button>
              <h3 className="text-xl font-bold mb-6">{editingPart.id ? 'Edit Item' : 'New Item'}</h3>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Name</label>
                    <input type="text" value={editingPart.name || ''} onChange={e => setEditingPart({ ...editingPart, name: e.target.value })} className={inputCls} placeholder="e.g. Toyota Smart Key" />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>SKU (our code)</label>
                    <input type="text" value={editingPart.sku || ''} onChange={e => setEditingPart({ ...editingPart, sku: e.target.value })} className={`${inputCls} font-mono uppercase`} placeholder="e.g. RM-TOY-01" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Марка / Платформа</label>
                    <input type="text" list="part-groups" value={editingPart.group || ''} onChange={e => setEditingPart({ ...editingPart, group: e.target.value })} className={inputCls} placeholder="Ford / Toyota / Универсал…" />
                    <datalist id="part-groups">
                      {groupOptions.map(g => <option key={g} value={g} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Тип (категория)</label>
                    <input type="text" list="part-categories" value={editingPart.category || ''} onChange={e => setEditingPart({ ...editingPart, category: e.target.value })} className={inputCls} placeholder="заготовка / транспондер / flip…" />
                    <datalist id="part-categories">
                      {categoryOptions.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Location</label>
                    <input type="text" list="stock-locations" value={editingPart.location || ''} onChange={e => setEditingPart({ ...editingPart, location: e.target.value })} className={inputCls} placeholder="shop / van" />
                    <datalist id="stock-locations">
                      <option value="shop" />
                      <option value="van" />
                      {[...new Set(inventory.map(p => (p.location || '').trim()).filter(Boolean))].map(l => <option key={l} value={l} />)}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Cost ($)</label>
                    <input type="number" step="0.01" value={editingPart.cost ?? 0} onChange={e => setEditingPart({ ...editingPart, cost: parseFloat(e.target.value) || 0 })} className={`${inputCls} text-center font-mono text-amber-400`} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Price ($)</label>
                    <input type="number" step="0.01" value={editingPart.price ?? 0} onChange={e => setEditingPart({ ...editingPart, price: parseFloat(e.target.value) || 0 })} className={`${inputCls} text-center font-mono text-green-400`} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Min. alert</label>
                    <input type="number" value={editingPart.reorderPoint ?? 0} onChange={e => setEditingPart({ ...editingPart, reorderPoint: parseInt(e.target.value) || 0 })} className={`${inputCls} text-center font-mono`} />
                  </div>
                </div>

                {!editingPart.id && (
                  <div className="space-y-1.5">
                    <label className={labelCls}>Opening count</label>
                    <input type="number" value={editingPart.stock ?? 0} onChange={e => setEditingPart({ ...editingPart, stock: parseInt(e.target.value) || 0 })} className={`${inputCls} text-center font-mono`} />
                    <p className="text-[11px] text-slate-500 pl-1">After this, stock only changes through Receive, Sales, or Count — never edited by hand.</p>
                  </div>
                )}

                {/* Identifiers & photo */}
                <button onClick={() => setShowIds(s => !s)} className="w-full flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-widest pt-2">
                  <span>Identifiers &amp; photo</span>
                  <ChevronDown size={16} className={`transition-transform ${showIds ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showIds && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className={labelCls}>Brand</label>
                          <input type="text" value={editingPart.brand || ''} onChange={e => setEditingPart({ ...editingPart, brand: e.target.value })} className={inputCls} placeholder="Schlage" />
                        </div>
                        <div className="space-y-1.5">
                          <label className={labelCls}>MPN</label>
                          <input type="text" value={editingPart.mpn || ''} onChange={e => setEditingPart({ ...editingPart, mpn: e.target.value })} className={`${inputCls} font-mono`} placeholder="1145" />
                        </div>
                        <div className="space-y-1.5">
                          <label className={labelCls}>UPC</label>
                          <input type="text" value={editingPart.upc || ''} onChange={e => setEditingPart({ ...editingPart, upc: e.target.value })} className={`${inputCls} font-mono`} placeholder="043156…" />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {editingPart.photo
                          ? <img src={editingPart.photo} alt="" className="w-16 h-16 rounded-xl object-cover border border-white/10" />
                          : <div className="w-16 h-16 rounded-xl bg-slate-950 border border-white/10 flex items-center justify-center"><Package size={22} className="text-slate-600" /></div>}
                        <label className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-200 cursor-pointer hover:bg-white/10">
                          <Camera size={16} /> {editingPart.photo ? 'Change photo' : 'Add photo'}
                          <input type="file" accept="image/*" className="hidden" onChange={async e => {
                            const f = e.target.files?.[0];
                            if (f) { const thumb = await fileToThumb(f); setEditingPart(p => ({ ...p, photo: thumb })); }
                          }} />
                        </label>
                        {editingPart.photo && <button onClick={() => setEditingPart(p => ({ ...p, photo: undefined }))} className="text-slate-500 hover:text-red-400"><Trash2 size={16} /></button>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-8 flex gap-3">
                {editingPart.id && canEdit && (
                  <button onClick={() => { removeInventoryItem(editingPart.id!); setIsEditing(false); }} className="px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold border border-red-500/20 flex items-center justify-center shrink-0 active:scale-95"><Trash2 size={20} /></button>
                )}
                <button onClick={() => setIsEditing(false)} className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold">Cancel</button>
                <button onClick={handleSave} className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 text-white font-bold active:scale-95">Save</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

// ── Part drawer: details + movement ledger + stock actions ────────────────────
const PartDrawer: React.FC<{
  part: Part;
  movements: StockMovement[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onReceive: () => void;
  onCount: (actual: number) => void;
  onLoss: (qty: number, note?: string) => void;
  onDelete: () => void;
  canHandOut: boolean;
  techs: { id: string; name: string }[];
  onTransfer: (toUserId: string, qty: number) => void;
  meId: string;
  onDispute: (movementId: string, disputed: boolean) => void;
}> = ({ part, movements, canEdit, onClose, onEdit, onReceive, onCount, onLoss, onDelete, canHandOut, techs, onTransfer, meId, onDispute }) => {
  const [countVal, setCountVal] = useState('');
  const [lossVal, setLossVal] = useState('');
  const [handTo, setHandTo] = useState('');
  const [handQty, setHandQty] = useState('');
  const mp = marginPct(part.price, part.cost);
  const handedOut = heldTotal(part);
  // Only the person a handover was addressed to can say it never arrived, and only once.
  const canDispute = (m: StockMovement) =>
    m.type === 'transfer' && m.qty > 0 && m.toUserId === meId && !m.disputed;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex justify-end bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 border-l border-white/10 h-full overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {part.photo
              ? <img src={part.photo} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" />
              : <div className="w-12 h-12 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center shrink-0"><Package size={20} className="text-slate-500" /></div>}
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white leading-tight truncate">{part.name}</h3>
              <p className="text-xs text-slate-500 font-mono truncate">{part.sku} · {part.category}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white shrink-0"><X size={20} /></button>
        </div>

        {/* identifiers */}
        {(part.brand || part.mpn || part.upc) && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            {part.brand && <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-bold">{part.brand}</span>}
            {part.mpn && <span className="bg-slate-800 text-slate-400 px-2.5 py-1 rounded-md font-mono">MPN {part.mpn}</span>}
            {part.upc && <span className="bg-slate-800 text-slate-400 px-2.5 py-1 rounded-md font-mono">UPC {part.upc}</span>}
          </div>
        )}

        {/* stats */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-slate-950 rounded-xl p-3 border border-white/5">
            <p className="text-[10px] text-slate-500 uppercase font-bold">Всего</p>
            <p className={`text-lg font-black ${part.stock <= part.reorderPoint ? 'text-amber-500' : 'text-white'}`}>{part.stock}</p>
            {handedOut > 0 && <p className="text-[10px] font-bold text-slate-500">на полке {shelfQty(part)}</p>}
          </div>
          <div className="bg-slate-950 rounded-xl p-3 border border-white/5"><p className="text-[10px] text-slate-500 uppercase font-bold">Cost</p><p className="text-lg font-black text-amber-400">{part.cost != null ? money(part.cost) : '—'}</p></div>
          <div className="bg-slate-950 rounded-xl p-3 border border-white/5"><p className="text-[10px] text-slate-500 uppercase font-bold">Price</p><p className="text-lg font-black text-green-400">{money(part.price)}</p></div>
          <div className="bg-slate-950 rounded-xl p-3 border border-white/5"><p className="text-[10px] text-slate-500 uppercase font-bold">Margin</p><p className="text-lg font-black text-white">{mp != null ? `${mp}%` : '—'}</p></div>
        </div>

        {(handedOut > 0 || canHandOut) && (
          <div className="bg-slate-950 border border-white/10 rounded-xl p-3 space-y-2">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">У кого на руках</p>
            {handedOut === 0
              ? <p className="text-sm text-slate-500">Всё на полке — никому не выдано.</p>
              : (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(heldOf(part)).filter(([, n]) => n > 0).map(([uid, n]) => (
                    <span key={uid} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-200">
                      {techs.find(t => t.id === uid)?.name || uid}
                      <span className="text-blue-300 font-mono">{n}</span>
                      {canHandOut && (
                        <button onClick={() => onTransfer(uid, -1)} title="Вернуть 1 на склад"
                          className="text-slate-500 hover:text-red-400 -mr-0.5">
                          <Minus size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            {canHandOut && techs.length > 0 && (
              <div className="flex gap-1.5 pt-1">
                <select value={handTo} onChange={e => setHandTo(e.target.value)}
                  className="flex-1 min-w-0 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white outline-none focus:border-blue-500/50 [&>option]:bg-slate-900">
                  <option value="">Кому выдать…</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input value={handQty} onChange={e => setHandQty(e.target.value)} type="number" min={1} placeholder="Кол-во"
                  className="w-20 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white outline-none focus:border-blue-500/50" />
                <button
                  onClick={() => { const n = parseInt(handQty, 10); if (handTo && n > 0) { onTransfer(handTo, n); setHandQty(''); } }}
                  disabled={!handTo || !(parseInt(handQty, 10) > 0) || shelfQty(part) <= 0}
                  className="px-3 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed">
                  Выдать
                </button>
              </div>
            )}
            {canHandOut && techs.length === 0 && (
              <p className="text-[11px] text-slate-500">Некому выдавать — в команде нет активных техников.</p>
            )}
            {canHandOut && techs.length > 0 && shelfQty(part) <= 0 && handedOut > 0 && (
              <p className="text-[11px] text-amber-400/80">На полке пусто — всё на руках у техников.</p>
            )}
          </div>
        )}

        {canEdit && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={onReceive} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-bold active:scale-95"><Truck size={15} /> Receive</button>
              <button onClick={onEdit} className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2.5 rounded-xl text-sm font-bold active:scale-95"><Pencil size={15} /> Edit</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex gap-1.5">
                <input value={countVal} onChange={e => setCountVal(e.target.value)} type="number" placeholder="Count" className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50" />
                <button onClick={() => { const n = parseInt(countVal, 10); if (!isNaN(n)) { onCount(n); setCountVal(''); } }} className="px-3 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-200 hover:bg-white/10">Set</button>
              </div>
              <div className="flex gap-1.5">
                <input value={lossVal} onChange={e => setLossVal(e.target.value)} type="number" placeholder="Loss qty" className="w-full bg-slate-950 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-red-500/50" />
                <button onClick={() => { const n = parseInt(lossVal, 10); if (n > 0) { onLoss(n); setLossVal(''); } }} className="px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400 hover:bg-red-500/20">Loss</button>
              </div>
            </div>
          </div>
        )}

        {/* movement ledger */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Movement log</p>
          <div className="space-y-1">
            {movements.length === 0 && <p className="text-sm text-slate-500 italic py-4 text-center">No movements yet.</p>}
            {movements.map(m => {
              const meta = MOVEMENT_META[m.type];
              const tone = meta.tone === 'in' ? 'text-green-400' : meta.tone === 'out' ? 'text-red-400' : 'text-amber-400';
              const detail = m.supplierName || (m.jobId ? `job ${m.jobId.slice(-5)}` : '') || m.note || '';
              return (
                <div key={m.id} className="flex items-center gap-3 py-2 border-t border-white/5">
                  <span className={`w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${tone}`}>
                    {m.qty >= 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{meta.label}{detail ? <span className="text-slate-500"> · {detail}</span> : ''}</p>
                    <p className="text-[11px] text-slate-500">{new Date(m.timestamp).toLocaleDateString()}{m.userName ? ` · ${m.userName}` : ''}</p>
                    {m.disputed && (
                      <p className="text-[11px] font-bold text-red-400 mt-0.5">
                        <TriangleAlert size={11} className="inline -mt-0.5 mr-1" />
                        {m.disputed.byName} не получал
                      </p>
                    )}
                    {canDispute(m) && (
                      <button onClick={() => onDispute(m.id, true)}
                        className="text-[11px] font-bold text-slate-500 hover:text-red-400 mt-0.5">
                        Не получал
                      </button>
                    )}
                    {m.disputed && canHandOut && (
                      <div className="flex gap-3 mt-1">
                        <button onClick={() => { onTransfer(m.toUserId || '', -m.qty); onDispute(m.id, false); }}
                          className="text-[11px] font-bold text-blue-300 hover:text-blue-200">Вернуть на склад</button>
                        <button onClick={() => onDispute(m.id, false)}
                          className="text-[11px] font-bold text-slate-500 hover:text-white">Всё верно</button>
                      </div>
                    )}
                  </div>
                  <span className={`font-mono text-sm font-bold shrink-0 ${tone}`}>{m.qty >= 0 ? '+' : ''}{m.qty}</span>
                </div>
              );
            })}
          </div>
        </div>

        {canEdit && (
          <button onClick={onDelete} className="w-full flex items-center justify-center gap-2 text-red-400/80 hover:text-red-400 text-xs font-bold py-2"><Trash2 size={14} /> Delete item</button>
        )}
      </motion.div>
    </motion.div>
  );
};

// ── Reorder list: everything at/below its reorder point, ready to purchase ────
const ReorderModal: React.FC<{
  inventory: Part[];
  movements: StockMovement[];
  canEdit: boolean;
  onClose: () => void;
  onReceive: (rows: { partId: string; qty: string; cost: string }[]) => void;
}> = ({ inventory, movements, canEdit, onClose, onReceive }) => {
  const [copied, setCopied] = useState(false);
  // Weekly sales rate per part over the trailing 90 days — the smarter reorder signal.
  const cutoff = Date.now() - 90 * 86400000;
  const weeklyRate = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== 'sale' || new Date(m.timestamp).getTime() < cutoff) continue;
    weeklyRate.set(m.partId, (weeklyRate.get(m.partId) || 0) + Math.abs(m.qty));
  }
  for (const [id, total] of weeklyRate) weeklyRate.set(id, total / (90 / 7));

  const low = inventory
    .filter(p => p.stock <= p.reorderPoint)
    .map(p => {
      // Order whichever is larger: back up to 2× the alert level, or 4 weeks of cover
      // at the part's actual sales pace — fast movers get more than the static floor.
      const rate = weeklyRate.get(p.id) || 0;
      const suggested = Math.max(p.reorderPoint * 2 - p.stock, Math.ceil(rate * 4 - p.stock), 1);
      const lastReceive = movements.find(m => m.partId === p.id && m.type === 'receive' && m.supplierName);
      return { part: p, suggested, rate, lastSupplier: lastReceive?.supplierName || '' };
    })
    .sort((a, b) => (a.part.stock - a.part.reorderPoint) - (b.part.stock - b.part.reorderPoint));

  const copyList = () => {
    const text = low.map(l =>
      `${l.suggested} × ${l.part.name}${l.part.mpn ? ` (MPN ${l.part.mpn})` : l.part.upc ? ` (UPC ${l.part.upc})` : ''}${l.lastSupplier ? ` — ${l.lastSupplier}` : ''}`
    ).join('\n');
    navigator.clipboard?.writeText(`Reorder list:\n${text}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="bg-slate-900 border border-white/10 p-5 rounded-2xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white"><X size={20} /></button>
        <h3 className="text-xl font-bold mb-1 flex items-center gap-2"><AlertCircle size={20} className="text-amber-500" /> Reorder List</h3>
        <p className="text-xs text-slate-500 mb-5">Everything at or below its alert level, most urgent first.</p>

        <div className="space-y-2">
          {low.map(({ part, suggested, rate, lastSupplier }) => (
            <div key={part.id} className="flex items-center justify-between gap-3 bg-slate-950 border border-white/10 rounded-2xl p-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{part.name}</p>
                <p className="text-[11px] text-slate-500 font-mono">
                  {part.stock} / {part.reorderPoint} on hand{rate > 0.1 ? ` · sells ~${rate.toFixed(1)}/wk` : ''}{lastSupplier ? ` · last from ${lastSupplier}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-sm font-black text-amber-400 tabular-nums">order {suggested}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={copyList} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm active:scale-95">
            {copied ? <><CheckCircle2 size={15} className="text-emerald-400" /> Copied</> : <><Copy size={15} /> Copy list</>}
          </button>
          {canEdit && (
            <button
              onClick={() => onReceive(low.map(l => ({ partId: l.part.id, qty: String(l.suggested), cost: l.part.cost != null ? String(l.part.cost) : '' })))}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/20 active:scale-95"
            >
              <Truck size={15} /> Receive these
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Receive modal: multi-row purchase → stock + Keys & Stock expense ──────────
type ReceiveRow = { partId: string; qty: number; cost: number };
const ReceiveModal: React.FC<{
  inventory: Part[];
  initialPartId?: string;
  initialRows?: { partId: string; qty: string; cost: string }[];
  knownSuppliers?: string[];
  onClose: () => void;
  onSubmit: (rows: ReceiveRow[], supplierName: string, logExpense: boolean) => void;
}> = ({ inventory, initialPartId, initialRows, knownSuppliers = [], onClose, onSubmit }) => {
  const seedPart = initialPartId ? inventory.find(p => p.id === initialPartId) : undefined;
  const [rows, setRows] = useState<{ partId: string; qty: string; cost: string }[]>(
    initialRows && initialRows.length > 0
      ? initialRows
      : [{ partId: seedPart?.id || '', qty: '', cost: seedPart?.cost != null ? String(seedPart.cost) : '' }],
  );
  const [supplier, setSupplier] = useState('');
  const [logExpense, setLogExpense] = useState(true);

  const setRow = (i: number, patch: Partial<{ partId: string; qty: string; cost: string }>) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const onPickPart = (i: number, partId: string) => {
    const p = inventory.find(x => x.id === partId);
    setRow(i, { partId, cost: p?.cost != null && !rows[i].cost ? String(p.cost) : rows[i].cost });
  };

  const total = rows.reduce((a, r) => a + (parseFloat(r.qty) || 0) * (parseFloat(r.cost) || 0), 0);
  const valid = rows.filter(r => r.partId && (parseFloat(r.qty) || 0) > 0);

  const submit = () => {
    if (valid.length === 0) return;
    onSubmit(valid.map(r => ({ partId: r.partId, qty: parseFloat(r.qty) || 0, cost: parseFloat(r.cost) || 0 })), supplier.trim(), logExpense);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="bg-slate-900 border border-white/10 p-5 rounded-2xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white"><X size={20} /></button>
        <h3 className="text-xl font-bold mb-1 flex items-center gap-2"><Truck size={20} className="text-blue-400" /> Receive Stock</h3>
        <p className="text-xs text-slate-500 mb-5">Record a purchase. Stock goes up and a Keys &amp; Stock expense is logged.</p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Supplier</label>
            <input value={supplier} onChange={e => setSupplier(e.target.value)} className={inputCls} placeholder="e.g. ABC Key Supply" list="known-suppliers" />
            {knownSuppliers.length > 0 && (
              <datalist id="known-suppliers">
                {knownSuppliers.map(s => <option key={s} value={s} />)}
              </datalist>
            )}
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              <span className="col-span-6">Part</span><span className="col-span-2 text-right">Qty</span><span className="col-span-3 text-right">Unit cost</span><span className="col-span-1" />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <select value={r.partId} onChange={e => onPickPart(i, e.target.value)} className="col-span-6 bg-slate-950 border border-white/10 rounded-lg px-2 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 appearance-none truncate">
                  <option value="">Select…</option>
                  {inventory.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} type="number" min="1" placeholder="0" className="col-span-2 bg-slate-950 border border-white/10 rounded-lg px-2 py-2.5 text-sm text-white text-right outline-none focus:border-blue-500/50" />
                <input value={r.cost} onChange={e => setRow(i, { cost: e.target.value })} type="number" step="0.01" placeholder="0.00" className="col-span-3 bg-slate-950 border border-white/10 rounded-lg px-2 py-2.5 text-sm text-white text-right outline-none focus:border-blue-500/50" />
                <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs)} className="col-span-1 flex justify-center text-slate-500 hover:text-red-400"><Minus size={16} /></button>
              </div>
            ))}
            <button onClick={() => setRows(rs => [...rs, { partId: '', qty: '', cost: '' }])} className="flex items-center gap-1.5 text-blue-400 text-sm font-bold pt-1"><Plus size={15} /> Add line</button>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <span className="text-sm text-slate-400">Total purchase</span>
            <span className="text-xl font-black text-white">{money(total)}</span>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer select-none">
            <input type="checkbox" checked={logExpense} onChange={e => setLogExpense(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            <span className="flex items-center gap-1.5"><ClipboardList size={15} className="text-slate-400" /> Log to expenses · <span className="text-white font-semibold">Keys &amp; Stock</span></span>
          </label>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold">Cancel</button>
          <button onClick={submit} disabled={valid.length === 0} className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 text-white font-bold active:scale-95 disabled:opacity-50">Receive {money(total)}</button>
        </div>
      </motion.div>
    </motion.div>
  );
};
