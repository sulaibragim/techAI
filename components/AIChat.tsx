import React, { useState } from 'react';
import { Send, Bot, Sparkles, BrainCircuit, KeyRound, Settings } from 'lucide-react';
import { getStrategicBrainResponse } from '../geminiService';
import { useAppStore, useAIActions } from '../store';
import { useSettingsStore } from '../settingsStore';

export const AIChat: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ text: string, role: 'user' | 'assistant' }[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const { jobs, setActiveTab } = useAppStore();
  const { handleAction } = useAIActions();
  const { geminiApiKey } = useSettingsStore();

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { text: userMsg, role: 'user' }]);
    setIsTyping(true);

    try {
      const history = messages.map(m => ({
        text: m.text,
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model'
      }));

      const response = await getStrategicBrainResponse(userMsg, history, {
        onAction: handleAction
      });
      
      setMessages(prev => [...prev, { text: response || 'I have processed your request.', role: 'assistant' }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { text: 'I encountered an issue processing your request.', role: 'assistant' }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!geminiApiKey) {
    return (
      <div className="max-w-4xl mx-auto h-[calc(100vh-160px)] flex flex-col items-center justify-center bg-[#1F2937]/30 rounded-2xl border border-white/10 backdrop-blur-xl">
        <div className="text-center space-y-5 px-8 max-w-sm">
          <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <KeyRound size={28} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-2">API Key Required</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Add your Gemini API key in Settings to activate the AI Brain.</p>
          </div>
          <button
            onClick={() => setActiveTab('settings')}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all active:scale-95 mx-auto"
          >
            <Settings size={14} />
            <span>Open Settings</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-160px)] flex flex-col bg-[#1F2937]/30 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-xl">
      <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-600/10 to-transparent">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-2xl shadow-blue-600/20">
            <BrainCircuit size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-black">Strategic Brain</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em]">Powered by Gemini 3 Pro</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-xs font-bold text-blue-500 bg-blue-500/10 px-3 py-1.5 rounded-full">
          <Sparkles size={12} />
          <span>Intelligent Mode Active</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <Bot size={48} className="text-blue-500" />
            <div>
              <p className="text-base font-bold mb-2">Ask about your business</p>
              <p className="text-sm max-w-xs text-slate-300">"Analyze my revenue trends for the last 30 days" or "How can I increase my average ticket size?"</p>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3.5 rounded-2xl leading-relaxed text-sm ${
              m.role === 'user'
                ? 'bg-blue-600 text-white font-medium shadow-xl'
                : 'bg-slate-900 text-gray-300 border border-white/10'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-900 p-3.5 rounded-2xl border border-white/10 flex space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100" />
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200" />
            </div>
          </div>
        )}
      </div>

      <div className="p-5 border-t border-white/10 bg-slate-900/50">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="Type your strategic question..."
            className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 pr-14 focus:border-blue-500 outline-none transition-all font-medium"
          />
          <button
            onClick={handleSend}
            className="absolute right-2.5 w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-900/40"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};