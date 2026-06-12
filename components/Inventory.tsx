import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, Search, Plus, AlertCircle, RefreshCw, X, Minus, Trash2,
  Truck, ClipboardList, ChevronDown, Camera, ArrowDownLeft, ArrowUpRight, Pencil, TriangleAlert,
} from 'lucide-react';
import { useAppStore } from '../store';
import { useSettingsStore } from '../settingsStore';
import { useCurrentUser, can } from '../authStore';
import { Part, StockMovement, MOVEMENT_META } from '../types';

const CATEGORIES = ['Key Blanks', 'Remotes', 'Cylinders', 'Hardware', 'Tools'] as const;

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    syncInventory, receiveStock, adjustStockTo,
  } = useAppStore();
  const movements = useSettingsStore(s => s.stockMovements);

  const currentUser = useCurrentUser();
  const canEdit = currentUser ? can.editInventory(currentUser.role) : false;

  const [syncing, setSyncing] = useState(false);
  const handleSync = async () => { setSyncing(true); try { await syncInventory(); } finally { setSyncing(false); } };

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('All');

  const [isEditing, setIsEditing] = useState(false);
  const [editingPart, setEditingPart] = useState<Partial<Part>>({});
  const [showIds, setShowIds] = useState(false);

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const filteredInventory = inventory.filter((part: Part) => {
    if (filter !== 'All' && part.category !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hit = [part.name, part.sku, part.brand, part.mpn, part.upc].some(v => v?.toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });

  const inventoryAtCost = inventory.reduce((a, p) => a + p.stock * (p.cost ?? 0), 0);
  const lowCount = inventory.filter(p => p.stock <= p.reorderPoint).length;
  const lossThisMonth = useMemo(() => {
    const mk = monthKey();
    return movements
      .filter(m => m.timestamp.slice(0, 7) === mk && (m.type === 'loss' || (m.type === 'adjust' && m.qty < 0)))
      .reduce((a, m) => a + Math.abs(m.qty) * (m.unitCost ?? 0), 0);
  }, [movements]);

  const drawerPart = drawerId ? inventory.find(p => p.id === drawerId) ?? null : null;

  const openEditor = (part?: Part) => {
    setShowIds(false);
    if (part) setEditingPart(part);
    else setEditingPart({ name: '', sku: '', category: 'Key Blanks', stock: 0, reorderPoint: 0, price: 0, cost: 0, location: 'shop' });
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
        <div className="flex items-center gap-3">
          <button onClick={handleSync} disabled={syncing} className="flex items-center space-x-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/10 transition-colors active:scale-95 disabled:opacity-60">
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Syncing…' : 'Sync'}</span>
          </button>
          {canEdit && (
            <>
              <button onClick={() => openEditor()} className="flex items-center space-x-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm font-bold hover:bg-white/10 transition-colors active:scale-95">
                <Plus size={16} />
                <span>New Item</span>
              </button>
              <button onClick={() => setReceiveOpen(true)} className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-colors active:scale-95">
                <Truck size={16} />
                <span>Receive Stock</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* METRICS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 p-4 opacity-5"><Package size={40} /></div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Inventory at cost</p>
          <p className="text-2xl font-black text-white">{money(inventoryAtCost)}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-500"><AlertCircle size={40} /></div>
          <p className="text-amber-500 text-xs font-bold uppercase tracking-widest mb-1">Low stock</p>
          <p className="text-2xl font-black text-amber-500">{lowCount}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-red-500"><TriangleAlert size={40} /></div>
          <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-1">Loss this month</p>
          <p className="text-2xl font-black text-red-400">{money(lossThisMonth)}</p>
        </div>
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 p-4 opacity-5"><Package size={40} /></div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total units</p>
          <p className="text-2xl font-black text-white">{inventory.reduce((a, b) => a + b.stock, 0)}</p>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-slate-900 rounded-2xl border border-white/10 overflow-hidden shadow-xl">
        <div className="p-6 border-b border-white/10 flex flex-col md:flex-row gap-4 justify-between">
          <div className="flex bg-slate-950 border border-white/10 rounded-xl overflow-hidden p-1 w-full md:w-auto overflow-x-auto hide-scrollbar">
            {['All', ...CATEGORIES].map(c => (
              <button key={c} onClick={() => setFilter(c)}
                className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${filter === c ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
                {c}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="Search name, SKU, barcode…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-white outline-none focus:border-blue-500/50 transition-colors" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-950/50 border-b border-white/5 uppercase text-[10px] tracking-widest text-slate-500 font-bold">
                <th className="p-4 pl-6">Item</th>
                <th className="p-4 hidden md:table-cell">Category</th>
                <th className="p-4 text-right">Stock</th>
                <th className="p-4 text-right hidden sm:table-cell">Cost</th>
                <th className="p-4 text-right">Price</th>
                <th className="p-4 pr-6 text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredInventory.map((item: Part) => {
                const isLow = item.stock <= item.reorderPoint;
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
                          <p className="text-[11px] text-slate-500 font-mono truncate">{item.sku}{item.upc ? ` · ${item.upc}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell"><span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md text-xs font-bold">{item.category}</span></td>
                    <td className="p-4 text-right">
                      <span className={`font-mono text-sm ${isLow ? 'text-amber-500 font-bold' : 'text-slate-300'}`}>{item.stock}</span>
                      <span className="text-[11px] text-slate-600 font-mono"> / {item.reorderPoint}</span>
                    </td>
                    <td className="p-4 text-right font-mono text-sm text-slate-400 hidden sm:table-cell">{item.cost != null ? money(item.cost) : '—'}</td>
                    <td className="p-4 text-right font-mono text-sm text-slate-300">{money(item.price)}</td>
                    <td className="p-4 pr-6 text-right font-mono text-sm">
                      {mp != null ? <span className={mp >= 0 ? 'text-green-400' : 'text-red-400'}>{mp}%</span> : <span className="text-slate-600">—</span>}
                    </td>
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
          />
        )}
      </AnimatePresence>

      {/* RECEIVE MODAL */}
      <AnimatePresence>
        {receiveOpen && (
          <ReceiveModal
            inventory={inventory}
            initialPartId={drawerPart?.id}
            onClose={() => setReceiveOpen(false)}
            onSubmit={(rows, supplierName, logExpense) => {
              rows.forEach(r => receiveStock(r.partId, r.qty, r.cost, { supplierName, logExpense }));
              setReceiveOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* EDITOR MODAL */}
      <AnimatePresence>
        {isEditing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-white/10 p-5 rounded-2xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
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

                <div className="space-y-1.5">
                  <label className={labelCls}>Category</label>
                  <select value={editingPart.category || 'Key Blanks'} onChange={e => setEditingPart({ ...editingPart, category: e.target.value as Part['category'] })} className={`${inputCls} appearance-none`}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
}> = ({ part, movements, canEdit, onClose, onEdit, onReceive, onCount, onLoss, onDelete }) => {
  const [countVal, setCountVal] = useState('');
  const [lossVal, setLossVal] = useState('');
  const mp = marginPct(part.price, part.cost);

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
          <div className="bg-slate-950 rounded-xl p-3 border border-white/5"><p className="text-[10px] text-slate-500 uppercase font-bold">Stock</p><p className={`text-lg font-black ${part.stock <= part.reorderPoint ? 'text-amber-500' : 'text-white'}`}>{part.stock}</p></div>
          <div className="bg-slate-950 rounded-xl p-3 border border-white/5"><p className="text-[10px] text-slate-500 uppercase font-bold">Cost</p><p className="text-lg font-black text-amber-400">{part.cost != null ? money(part.cost) : '—'}</p></div>
          <div className="bg-slate-950 rounded-xl p-3 border border-white/5"><p className="text-[10px] text-slate-500 uppercase font-bold">Price</p><p className="text-lg font-black text-green-400">{money(part.price)}</p></div>
          <div className="bg-slate-950 rounded-xl p-3 border border-white/5"><p className="text-[10px] text-slate-500 uppercase font-bold">Margin</p><p className="text-lg font-black text-white">{mp != null ? `${mp}%` : '—'}</p></div>
        </div>

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

// ── Receive modal: multi-row purchase → stock + Keys & Stock expense ──────────
type ReceiveRow = { partId: string; qty: number; cost: number };
const ReceiveModal: React.FC<{
  inventory: Part[];
  initialPartId?: string;
  onClose: () => void;
  onSubmit: (rows: ReceiveRow[], supplierName: string, logExpense: boolean) => void;
}> = ({ inventory, initialPartId, onClose, onSubmit }) => {
  const seedPart = initialPartId ? inventory.find(p => p.id === initialPartId) : undefined;
  const [rows, setRows] = useState<{ partId: string; qty: string; cost: string }[]>([
    { partId: seedPart?.id || '', qty: '', cost: seedPart?.cost != null ? String(seedPart.cost) : '' },
  ]);
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
            <input value={supplier} onChange={e => setSupplier(e.target.value)} className={inputCls} placeholder="e.g. ABC Key Supply" />
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
