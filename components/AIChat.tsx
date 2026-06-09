import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, Sparkles, BrainCircuit, KeyRound, Settings, Trash2, BarChart3, Users, Phone, Package, Calendar, MessageSquare } from 'lucide-react';
import { getStrategicBrainResponse } from '../geminiService';
import { useAppStore } from '../store';
import { useSettingsStore, getEffectiveApiKey } from '../settingsStore';

interface ChatMessage {
  id: string;
  text: string;
  role: 'user' | 'assistant';
  timestamp: number;
}

const STORAGE_KEY = 'techai-brain-chat';

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(msgs: ChatMessage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-100)));
}

const QUICK_ACTIONS = [
  { label: 'Dashboard', icon: BarChart3, prompt: 'Дай мне обзор бизнеса на сегодня' },
  { label: 'Jobs', icon: Calendar, prompt: 'Покажи все активные заказы' },
  { label: 'Techs', icon: Users, prompt: 'Какой статус у техников?' },
  { label: 'Calls', icon: Phone, prompt: 'Покажи последние звонки' },
  { label: 'SMS', icon: MessageSquare, prompt: 'Покажи последние сообщения' },
  { label: 'Inventory', icon: Package, prompt: 'Какие запчасти заканчиваются?' },
];

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag key={`list-${elements.length}`} className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} pl-4 space-y-0.5 my-1`}>
          {listItems.map((item, i) => <li key={i}>{formatInline(item)}</li>)}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  };

  const formatInline = (line: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const codeMatch = remaining.match(/`([^`]+)`/);

      let earliest: { type: string; match: RegExpMatchArray; index: number } | null = null;
      if (boldMatch?.index !== undefined) earliest = { type: 'bold', match: boldMatch, index: boldMatch.index };
      if (codeMatch?.index !== undefined && (!earliest || codeMatch.index < earliest.index)) earliest = { type: 'code', match: codeMatch, index: codeMatch.index };

      if (!earliest) {
        parts.push(remaining);
        break;
      }

      if (earliest.index > 0) parts.push(remaining.slice(0, earliest.index));

      if (earliest.type === 'bold') {
        parts.push(<strong key={key++} className="font-bold text-white">{earliest.match[1]}</strong>);
      } else if (earliest.type === 'code') {
        parts.push(<code key={key++} className="bg-white/10 px-1.5 py-0.5 rounded text-blue-300 text-[11px] font-mono">{earliest.match[1]}</code>);
      }

      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    }

    return <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.match(/^#{1,3}\s/)) {
      flushList();
      const level = line.match(/^(#{1,3})/)?.[1].length || 1;
      const text = line.replace(/^#{1,3}\s/, '');
      const cls = level === 1 ? 'text-sm font-bold text-white' : level === 2 ? 'text-xs font-bold text-blue-400 uppercase tracking-wider' : 'text-xs font-semibold text-slate-300';
      elements.push(<p key={i} className={`${cls} ${i > 0 ? 'mt-2' : ''}`}>{text}</p>);
      continue;
    }

    if (line.match(/^[-*]\s/)) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      listItems.push(line.replace(/^[-*]\s/, ''));
      continue;
    }

    if (line.match(/^\d+\.\s/)) {
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      listItems.push(line.replace(/^\d+\.\s/, ''));
      continue;
    }

    flushList();

    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
      continue;
    }

    if (line.startsWith('---') || line.startsWith('━')) {
      elements.push(<hr key={i} className="border-white/10 my-2" />);
      continue;
    }

    elements.push(<p key={i} className="leading-relaxed">{formatInline(line)}</p>);
  }

  flushList();
  return <>{elements}</>;
}

export const AIChat: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [isTyping, setIsTyping] = useState(false);
  const { setActiveTab } = useAppStore();
  const { geminiApiKey } = useSettingsStore();
  const hasApiKey = !!(geminiApiKey || getEffectiveApiKey());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  const addMessage = useCallback((text: string, role: 'user' | 'assistant') => {
    const msg: ChatMessage = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, role, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  const handleSend = async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg) return;
    setInput('');
    addMessage(userMsg, 'user');
    setIsTyping(true);

    try {
      const history = messages.map(m => ({
        text: m.text,
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model'
      }));

      const response = await getStrategicBrainResponse(userMsg, history);
      addMessage(response || 'Готово.', 'assistant');
    } catch (error: any) {
      console.error(error);
      addMessage(`Ошибка: ${error?.message || 'Не удалось обработать запрос'}`, 'assistant');
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  if (!hasApiKey) {
    return (
      <div className="max-w-4xl mx-auto h-[calc(100vh-160px)] flex flex-col items-center justify-center bg-slate-800/30 rounded-2xl border border-white/10 backdrop-blur-xl">
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
    <div className="max-w-4xl mx-auto h-[calc(100vh-160px)] flex flex-col bg-slate-900/50 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-xl shadow-2xl">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-600/10 to-violet-600/5 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center shadow-2xl shadow-blue-600/20">
            <BrainCircuit size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">Дурачок AI</h2>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em]">Strategic Brain · TrustKey</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center space-x-1.5 text-[10px] font-bold text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
            <Sparkles size={10} />
            <span>Online</span>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-2 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
              title="Clear chat"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
            <div className="space-y-3 opacity-40">
              <Bot size={36} className="text-blue-500 mx-auto" />
              <div>
                <p className="text-sm font-bold mb-1 text-white">Привет, Sultan</p>
                <p className="text-xs text-slate-300 max-w-xs">Спроси что угодно о бизнесе, или используй быстрые команды ниже</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full max-w-md">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.prompt)}
                  className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-blue-600/10 border border-white/10 hover:border-blue-500/20 rounded-xl text-left transition-all active:scale-95 group"
                >
                  <action.icon size={14} className="text-slate-400 group-hover:text-blue-400 transition-colors shrink-0" />
                  <span className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl text-[13px] leading-relaxed ${
              m.role === 'user'
                ? 'bg-blue-600 text-white font-medium shadow-xl px-4 py-3'
                : 'bg-slate-800/80 text-slate-300 border border-white/10 px-4 py-3 shadow-lg'
            }`}>
              {m.role === 'assistant' ? renderMarkdown(m.text) : m.text}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-800/80 px-4 py-3 rounded-2xl border border-white/10 flex items-center space-x-1.5">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="text-[10px] text-slate-500 ml-2 font-semibold uppercase tracking-wider">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10 bg-slate-950/50 shrink-0">
        {messages.length > 0 && (
          <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide pb-1">
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.label}
                onClick={() => handleSend(action.prompt)}
                disabled={isTyping}
                className="flex items-center gap-1 px-2.5 py-1 bg-white/5 hover:bg-blue-600/10 border border-white/5 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-blue-400 transition-all shrink-0 disabled:opacity-40"
              >
                <action.icon size={10} />
                {action.label}
              </button>
            ))}
          </div>
        )}
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Спроси Дурачка..."
            disabled={isTyping}
            className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 pr-14 focus:border-blue-500/50 outline-none transition-all font-medium text-sm disabled:opacity-50 placeholder-slate-500"
          />
          <button
            onClick={() => handleSend()}
            disabled={isTyping || !input.trim()}
            className="absolute right-2.5 w-9 h-9 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:opacity-50 rounded-xl flex items-center justify-center text-white transition-all active:scale-95 shadow-lg shadow-blue-900/40"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
