import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { User, Phone, Mail, MapPin, Briefcase, DollarSign, ChevronRight, Search } from 'lucide-react';
import { useAppStore } from '../store';
import { Job } from '../types';

interface ClientRecord {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  jobs: Job[];
  totalSpend: number;
  lastJobDate: string;
}

export const ClientsList: React.FC<{ onJobSelect?: (job: Job) => void }> = ({ onJobSelect }) => {
  const { jobs } = useAppStore();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  const clients = useMemo<ClientRecord[]>(() => {
    const map = new Map<string, ClientRecord>();
    jobs.forEach(j => {
      const key = j.client.phone || j.client.email || `${j.client.firstName}-${j.client.lastName}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          firstName: j.client.firstName,
          lastName: j.client.lastName,
          phone: j.client.phone,
          email: j.client.email || '',
          address: j.client.address || '',
          jobs: [],
          totalSpend: 0,
          lastJobDate: j.scheduledDate,
        });
      }
      const rec = map.get(key)!;
      rec.jobs.push(j);
      rec.totalSpend += j.totalAmount;
      if (j.scheduledDate > rec.lastJobDate) rec.lastJobDate = j.scheduledDate;
    });
    return Array.from(map.values()).sort((a, b) => b.lastJobDate.localeCompare(a.lastJobDate));
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return clients;
    return clients.filter(c =>
      `${c.firstName} ${c.lastName} ${c.phone} ${c.email}`.toLowerCase().includes(q)
    );
  }, [clients, search]);

  if (selected) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-6 max-w-3xl mx-auto"
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelected(null)}
            className="p-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all"
          >
            <ChevronRight size={18} className="rotate-180" />
          </button>
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Client Profile</p>
            <h2 className="text-2xl font-bold text-white">{selected.firstName} {selected.lastName}</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Jobs', value: selected.jobs.length, icon: Briefcase },
            { label: 'Total Spent', value: `$${selected.totalSpend.toLocaleString()}`, icon: DollarSign },
            { label: 'Last Visit', value: selected.lastJobDate, icon: ChevronRight },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-slate-900 border border-white/5 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Icon size={16} className="text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-lg font-bold text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Contact</h3>
          <div className="space-y-3">
            {selected.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone size={14} className="text-blue-400 shrink-0" />
                <span className="text-white">{selected.phone}</span>
              </div>
            )}
            {selected.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail size={14} className="text-blue-400 shrink-0" />
                <span className="text-white">{selected.email}</span>
              </div>
            )}
            {selected.address && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin size={14} className="text-blue-400 shrink-0" />
                <span className="text-slate-300">{selected.address}</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Job History</h3>
          {selected.jobs
            .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
            .map(job => (
              <motion.div
                key={job.id}
                whileHover={{ x: 4 }}
                onClick={() => onJobSelect?.(job)}
                className="bg-slate-900 border border-white/5 rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:border-blue-500/20 transition-all"
              >
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">#{job.jobNumber}</p>
                  <p className="text-sm font-semibold text-white">{job.lockDetails.type} — {job.lockDetails.brand || 'N/A'}</p>
                  <p className="text-xs text-slate-500">{job.scheduledDate}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">${job.totalAmount}</p>
                  <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
                    job.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                    job.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                    'bg-blue-500/10 text-blue-400'
                  }`}>{job.status}</span>
                </div>
              </motion.div>
            ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6 max-w-3xl mx-auto"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-1">Client Database</p>
          <h2 className="text-2xl font-bold text-white">{clients.length} Clients</h2>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, email…"
          className="w-full bg-slate-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <User size={28} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm font-semibold">No clients found</p>
          </div>
        )}
        {filtered.map((client, i) => (
          <motion.div
            key={client.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileHover={{ x: 4 }}
            onClick={() => setSelected(client)}
            className="bg-slate-900 border border-white/5 rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:border-blue-500/20 transition-all"
          >
            <div className="w-12 h-12 bg-blue-600/10 rounded-xl flex items-center justify-center shrink-0 text-lg font-bold text-blue-400">
              {client.firstName[0]}{client.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{client.firstName} {client.lastName}</p>
              <p className="text-xs text-slate-400 mt-0.5">{client.phone}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-white">${client.totalSpend.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-0.5">{client.jobs.length} job{client.jobs.length !== 1 ? 's' : ''}</p>
            </div>
            <ChevronRight size={16} className="text-slate-600 shrink-0" />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
