import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Search, Plus, AlertCircle, RefreshCw, X, Minus, Trash2 } from 'lucide-react';
import { useAppStore } from '../store';
import { useCurrentUser, can } from '../authStore';
import { Part } from '../types';

export const Inventory: React.FC = () => {
  const { inventory, addInventoryItem, updateInventoryItem, removeInventoryItem } = useAppStore();
  const currentUser = useCurrentUser();
  const canEdit = currentUser ? can.editInventory(currentUser.role) : false;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('All');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingPart, setEditingPart] = useState<Partial<Part>>({});

  const categories = ['All', 'Key Blanks', 'Remotes', 'Cylinders', 'Hardware', 'Tools'];

  const filteredInventory = inventory.filter((part: Part) => {
    if (filter !== 'All' && part.category !== filter) return false;
    if (search && !part.name.toLowerCase().includes(search.toLowerCase()) && !part.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSave = () => {
    if (!editingPart.name || !editingPart.sku) return;
    
    if (editingPart.id) {
      updateInventoryItem(editingPart as Part);
    } else {
      addInventoryItem(editingPart as Omit<Part, 'id'>);
    }
    setIsEditing(false);
  };

  const openEditor = (part?: Part) => {
    if (part) {
      setEditingPart(part);
    } else {
      setEditingPart({
        name: '',
        sku: '',
        category: 'Key Blanks',
        stock: 0,
        reorderPoint: 0,
        price: 0
      });
    }
    setIsEditing(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Stock Operations</h2>
          <p className="text-slate-400 text-sm mt-1">Manage van inventory, reordering, and hardware pricing.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center space-x-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/10 transition-colors active:scale-95">
            <RefreshCw size={16} />
            <span>Sync</span>
          </button>
          {canEdit && (
            <button onClick={() => openEditor()} className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-colors active:scale-95">
              <Plus size={16} />
              <span>Add Item</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 relative overflow-hidden shadow-lg">
           <div className="absolute top-0 right-0 p-4 opacity-5"><Package size={40} /></div>
           <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total Assets</p>
           <p className="text-2xl font-black text-white">{inventory.reduce((a, b) => a + b.stock, 0)}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 relative overflow-hidden shadow-lg">
           <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-500"><AlertCircle size={40} /></div>
           <p className="text-amber-500 text-xs font-bold uppercase tracking-widest mb-1">Low Stock Alerts</p>
           <p className="text-2xl font-black text-amber-500">{inventory.filter((p: Part) => p.stock <= p.reorderPoint).length}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 relative overflow-hidden shadow-lg">
           <div className="absolute top-0 right-0 p-4 opacity-10 text-blue-500"><Package size={40} /></div>
           <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-1">Inventory Value</p>
           <p className="text-2xl font-black text-blue-400">${inventory.reduce((a, b: Part) => a + (b.stock * b.price), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-2xl border border-white/10 overflow-hidden shadow-xl">
        <div className="p-6 border-b border-white/10 flex flex-col md:flex-row gap-4 justify-between">
          <div className="flex bg-slate-950 border border-white/10 rounded-xl overflow-hidden p-1 w-full md:w-auto overflow-x-auto hide-scrollbar">
             {categories.map(c => (
               <button 
                 key={c}
                 onClick={() => setFilter(c)}
                 className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${filter === c ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
               >
                 {c}
               </button>
             ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search by SKU or Name..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-white outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-950/50 border-b border-white/5 uppercase text-[10px] tracking-widest text-slate-500 font-bold">
                 <th className="p-4 pl-6">SKU</th>
                 <th className="p-4">Item Name</th>
                 <th className="p-4">Category</th>
                 <th className="p-4 text-right">Stock</th>
                 <th className="p-4 text-right">Price</th>
                 <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredInventory.map((item: Part) => {
                const isLowStock = item.stock <= item.reorderPoint;
                return (
                  <motion.tr 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    key={item.id} 
                    className={`hover:bg-white/5 transition-colors ${isLowStock ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="p-4 pl-6 font-mono text-xs text-slate-400">{item.sku}</td>
                    <td className="p-4 font-semibold text-white">{item.name}</td>
                    <td className="p-4"><span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md text-xs font-bold">{item.category}</span></td>
                    <td className="p-4 text-right">
                       <span className={`font-mono text-sm ${isLowStock ? 'text-amber-500 font-bold' : 'text-slate-300'}`}>
                         {item.stock}
                       </span>
                    </td>
                    <td className="p-4 text-right font-mono text-sm text-slate-300">${item.price.toFixed(2)}</td>
                    <td className="p-4 pr-6 text-right">
                      {canEdit && (
                        <button onClick={() => openEditor(item)} className="text-blue-400 hover:text-blue-300 text-xs font-bold uppercase tracking-wider transition-colors active:scale-95">Edit</button>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 text-sm font-semibold">No assets match your search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isEditing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-white/10 p-5 rounded-2xl w-full max-w-lg shadow-2xl relative"
            >
              <button onClick={() => setIsEditing(false)} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
              <h3 className="text-xl font-bold mb-6">{editingPart.id ? 'Edit Inventory Asset' : 'Add New Asset'}</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Name</label>
                    <input 
                      type="text" 
                      value={editingPart.name || ''} 
                      onChange={e => setEditingPart({...editingPart, name: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white outline-none focus:border-blue-500/50"
                      placeholder="e.g. Smart Key"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">SKU Code</label>
                    <input 
                      type="text" 
                      value={editingPart.sku || ''} 
                      onChange={e => setEditingPart({...editingPart, sku: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white outline-none focus:border-blue-500/50 uppercase"
                      placeholder="e.g. KB-123"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Category</label>
                  <select 
                    value={editingPart.category || 'Key Blanks'} 
                    onChange={e => setEditingPart({...editingPart, category: e.target.value as any})}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white outline-none focus:border-blue-500/50 appearance-none"
                  >
                    {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Stock</label>
                    <div className="flex bg-slate-950 border border-white/10 rounded-xl items-center px-2">
                       <button onClick={() => setEditingPart({...editingPart, stock: Math.max(0, (editingPart.stock || 0) - 1)})} className="p-1 text-slate-400 hover:text-white"><Minus size={14}/></button>
                       <input 
                         type="number" 
                         value={editingPart.stock || 0} 
                         onChange={e => setEditingPart({...editingPart, stock: parseInt(e.target.value) || 0})}
                         className="w-full bg-transparent text-center text-sm font-bold text-white outline-none py-3"
                       />
                       <button onClick={() => setEditingPart({...editingPart, stock: (editingPart.stock || 0) + 1})} className="p-1 text-slate-400 hover:text-white"><Plus size={14}/></button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Min. Alert</label>
                    <input 
                      type="number" 
                      value={editingPart.reorderPoint || 0} 
                      onChange={e => setEditingPart({...editingPart, reorderPoint: parseInt(e.target.value) || 0})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl text-center px-4 py-3 text-sm font-mono text-amber-500 outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Unit Price ($)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={editingPart.price || 0} 
                      onChange={e => setEditingPart({...editingPart, price: parseFloat(e.target.value) || 0})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl text-center px-4 py-3 text-sm font-mono text-green-400 outline-none focus:border-blue-500/50"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                {editingPart.id && canEdit && (
                  <button
                    onClick={() => { removeInventoryItem(editingPart.id!); setIsEditing(false); }}
                    className="px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold transition-colors border border-red-500/20 flex items-center justify-center shrink-0 active:scale-95"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
                <button onClick={() => setIsEditing(false)} className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-colors">Cancel</button>
                <button onClick={handleSave} className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 text-white font-bold transition-colors active:scale-95">Save Asset</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

