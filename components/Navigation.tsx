import React from 'react';
import { Calendar, Briefcase, BarChart2, BrainCircuit, MessageSquare, Phone } from 'lucide-react';

interface NavigationProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onTabChange }) => {
  const tabs = [
    { id: 'calendar', label: 'Work', icon: Calendar },
    { id: 'jobs', label: 'Jobs', icon: Briefcase },
    { id: 'messages', label: 'Inbox', icon: MessageSquare },
    { id: 'calls', label: 'Calls', icon: Phone },
    { id: 'analytics', label: 'Stats', icon: BarChart2 },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#111827] border-t border-[#1F2937] px-4 py-3 flex justify-between items-center z-40">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center space-y-1 transition-colors ${
              isActive ? 'text-blue-500' : 'text-gray-400'
            }`}
          >
            <Icon size={18} />
            <span className="text-[8px] font-bold uppercase tracking-widest">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};