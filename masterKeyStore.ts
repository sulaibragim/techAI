import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MasterKeySystem, MasterKeyDoor, MasterKeyDoorStatus } from './types';
import { presetFor, type MasterKeyBrand } from './masterKeyUtils';

// Master-key jobs live on their own: a system is a building, not a work order, and
// it outlives any single visit. Persisted locally for now — same path the Auto-Key
// tool took before it moved server-side.

const uid = () => `mk-${Math.random().toString(36).slice(2, 10)}`;
const now = () => new Date().toISOString();
const blank = (n: number): (number | null)[] => Array(n).fill(null);

interface MasterKeyState {
  systems: MasterKeySystem[];
  /** Which system the tab is showing. null → the picker. */
  activeId: string | null;

  createSystem: (name: string, brand: MasterKeyBrand) => string;
  deleteSystem: (id: string) => void;
  setActive: (id: string | null) => void;

  renameSystem: (id: string, name: string) => void;
  setAddress: (id: string, address: string) => void;
  setBrand: (id: string, brand: MasterKeyBrand) => void;
  setChambers: (id: string, chambers: number) => void;
  setMasterDepth: (id: string, index: number, depth: number | null) => void;

  addDoor: (id: string, name: string) => void;
  removeDoor: (id: string, doorId: string) => void;
  renameDoor: (id: string, doorId: string, name: string) => void;
  setDoorDepth: (id: string, doorId: string, index: number, depth: number | null) => void;
  setDoorBitting: (id: string, doorId: string, bitting: (number | null)[]) => void;
  setDoorStatus: (id: string, doorId: string, status: MasterKeyDoorStatus) => void;
}

export const useMasterKeyStore = create<MasterKeyState>()(
  persist(
    (set) => {
      // Every mutation rewrites updatedAt, so the list can sort by recency.
      const patch = (id: string, fn: (s: MasterKeySystem) => MasterKeySystem) =>
        set(st => ({
          systems: st.systems.map(s => (s.id === id ? { ...fn(s), updatedAt: now() } : s)),
        }));

      const patchDoor = (id: string, doorId: string, fn: (d: MasterKeyDoor) => MasterKeyDoor) =>
        patch(id, s => ({ ...s, doors: s.doors.map(d => (d.id === doorId ? fn(d) : d)) }));

      return {
        systems: [],
        activeId: null,

        createSystem: (name, brand) => {
          const preset = presetFor(brand);
          const id = uid();
          const system: MasterKeySystem = {
            id,
            name: name.trim() || 'Без названия',
            brand,
            chambers: preset.defaultChambers,
            masterBitting: blank(preset.defaultChambers),
            doors: [],
            createdAt: now(),
            updatedAt: now(),
          };
          set(st => ({ systems: [system, ...st.systems], activeId: id }));
          return id;
        },

        deleteSystem: (id) =>
          set(st => ({
            systems: st.systems.filter(s => s.id !== id),
            activeId: st.activeId === id ? null : st.activeId,
          })),

        setActive: (id) => set({ activeId: id }),

        renameSystem: (id, name) => patch(id, s => ({ ...s, name: name.trim() || 'Без названия' })),
        setAddress: (id, address) => patch(id, s => ({ ...s, address })),

        // Switching brand can change the chamber count, which would leave stale
        // depths behind. Resize every bitting and drop depths the brand cannot cut.
        setBrand: (id, brand) => {
          const preset = presetFor(brand);
          patch(id, s => {
            const chambers = preset.chamberOptions.includes(s.chambers)
              ? s.chambers
              : preset.defaultChambers;
            const fit = (b: (number | null)[]) =>
              Array.from({ length: chambers }, (_, i) => {
                const d = b[i];
                return d !== null && d !== undefined && d >= preset.minDepth && d <= preset.maxDepth ? d : null;
              });
            return {
              ...s,
              brand,
              chambers,
              masterBitting: fit(s.masterBitting),
              doors: s.doors.map(d => ({ ...d, bitting: fit(d.bitting) })),
            };
          });
        },

        setChambers: (id, chambers) =>
          patch(id, s => {
            const fit = (b: (number | null)[]) =>
              Array.from({ length: chambers }, (_, i) => (i < b.length ? b[i] : null));
            return {
              ...s,
              chambers,
              masterBitting: fit(s.masterBitting),
              doors: s.doors.map(d => ({ ...d, bitting: fit(d.bitting) })),
            };
          }),

        setMasterDepth: (id, index, depth) =>
          patch(id, s => ({
            ...s,
            masterBitting: s.masterBitting.map((d, i) => (i === index ? depth : d)),
          })),

        addDoor: (id, name) =>
          patch(id, s => ({
            ...s,
            doors: [
              ...s.doors,
              { id: uid(), name: name.trim() || `Дверь ${s.doors.length + 1}`, bitting: blank(s.chambers), status: 'planned' },
            ],
          })),

        removeDoor: (id, doorId) => patch(id, s => ({ ...s, doors: s.doors.filter(d => d.id !== doorId) })),

        renameDoor: (id, doorId, name) =>
          patchDoor(id, doorId, d => ({ ...d, name: name.trim() || d.name })),

        setDoorDepth: (id, doorId, index, depth) =>
          patchDoor(id, doorId, d => ({
            ...d,
            bitting: d.bitting.map((x, i) => (i === index ? depth : x)),
          })),

        setDoorBitting: (id, doorId, bitting) => patchDoor(id, doorId, d => ({ ...d, bitting })),

        setDoorStatus: (id, doorId, status) => patchDoor(id, doorId, d => ({ ...d, status })),
      };
    },
    { name: 'techai-masterkey-v1', storage: createJSONStorage(() => localStorage) }
  )
);

export const activeSystem = (s: MasterKeyState): MasterKeySystem | null =>
  s.systems.find(x => x.id === s.activeId) || null;
