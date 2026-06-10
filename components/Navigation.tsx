import React, { useRef, useEffect } from 'react';
import { Calendar, Briefcase, BarChart2, BrainCircuit, MessageSquare, Phone, Package, Users, Settings, LogOut, Receipt } from 'lucide-react';
import { useAuthStore, useCurrentUser, visibleTabsFor } from '../authStore';

interface NavigationProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

// Single source of truth for every reachable tab. Rendered in the order returned
// by visibleTabsFor() so the bar matches each role's tab ordering.
const TAB_META: Record<string, { label: string; icon: React.ComponentType<{ size?: number }> }> = {
  calendar:   { label: 'Work',     icon: Calendar },
  jobs:       { label: 'Jobs',     icon: Briefcase },
  messages:   { label: 'Inbox',    icon: MessageSquare },
  calls:      { label: 'Calls',    icon: Phone },
  clients:    { label: 'Clients',  icon: Users },
  analytics:  { label: 'Stats',    icon: BarChart2 },
  accounting: { label: 'Books',    icon: Receipt },
  inventory:  { label: 'Stock',    icon: Package },
  brain:      { label: 'AI',       icon: BrainCircuit },
  settings:   { label: 'Settings', icon: Settings },
};

// At most this many items fit comfortably across a phone width. Up to this count
// the items stretch to fill the bar evenly; beyond it the bar scrolls horizontally.
const MAX_FIT = 5;

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onTabChange }) => {
  const logout = useAuthStore(s => s.logout);
  const currentUser = useCurrentUser();
  const tabs = (currentUser ? visibleTabsFor(currentUser.role) : []).filter(id => TAB_META[id]);

  // +1 for the Log out button. ≤5 → stretch evenly; >5 → swipeable scroll strip.
  const scrolls = tabs.length + 1 > MAX_FIT;

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // In scroll mode, keep the current tab visible by centring it on change.
  useEffect(() => {
    if (scrolls) activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [currentTab, scrolls]);

  const itemBase = 'relative flex flex-col items-center justify-center gap-1 h-14 rounded-2xl transition-colors active:scale-95';
  // Stretch evenly (flex-1) when everything fits; fixed-width snap targets when scrolling.
  const itemSize = scrolls ? 'shrink-0 snap-center min-w-[58px] px-2' : 'flex-1 min-w-0 px-1';

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-white/10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Edge fades hint horizontal scroll — only shown when the bar actually scrolls */}
      {scrolls && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-slate-900/95 to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-900/95 to-transparent z-10" />
        </>
      )}

      <div
        ref={scrollRef}
        className={
          scrolls
            ? 'flex items-stretch gap-1 overflow-x-auto scrollbar-hide px-3 py-1.5 snap-x snap-mandatory overscroll-x-contain'
            : 'flex items-stretch gap-1 px-2 py-1.5'
        }
      >
        {tabs.map((id) => {
          const { label, icon: Icon } = TAB_META[id];
          const isActive = currentTab === id;
          return (
            <button
              key={id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onTabChange(id)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`${itemBase} ${itemSize} ${isActive ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-full bg-blue-400" />}
              <Icon size={20} />
              <span className="text-[11px] font-semibold leading-none">{label}</span>
            </button>
          );
        })}

        {/* Log out — danger red, last item */}
        <button
          onClick={logout}
          aria-label="Log out"
          className={`${itemBase} ${itemSize} text-red-400/80 hover:text-red-400 ${scrolls ? 'ml-1 border-l border-white/10' : ''}`}
        >
          <LogOut size={20} />
          <span className="text-[11px] font-semibold leading-none">Exit</span>
        </button>
      </div>
    </nav>
  );
};
