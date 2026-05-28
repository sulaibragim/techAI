
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, X, Bot, User, Minimize2, CheckCircle, Calendar, Edit3, KeyRound } from 'lucide-react';
import { GeminiVoiceAssistant } from '../geminiService';
import { useAppStore, useAIActions } from '../store';
import { useSettingsStore } from '../settingsStore';
import { Job, Message, JobStatus } from '../types';

export const VoiceAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [notificationText, setNotificationText] = useState('');
  const [messages, setMessages] = useState<{ text: string, role: 'user' | 'assistant', isFinal?: boolean }[]>([]);
  
  const assistantRef = useRef<GeminiVoiceAssistant | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { handleAction } = useAIActions();
  const { geminiApiKey } = useSettingsStore();

  // Use a ref to always have the latest handleAction in the long-lived voice session
  const actionRef = useRef(handleAction);
  useEffect(() => {
    actionRef.current = handleAction;
  }, [handleAction]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const triggerConfirmation = useCallback((text: string = 'Success') => {
    setNotificationText(text);
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 3000);
  }, []);

  const handleActionWithConfirmation = useCallback(async (action: string, data: any) => {
    // Call the latest action from the ref
    const result = await actionRef.current(action, data);
    if (result.status === 'success') {
      if (action === 'create_job') triggerConfirmation('Job Created');
      if (action === 'update_job') triggerConfirmation('Record Updated');
      if (action === 'navigate_to') triggerConfirmation(`Navigating to ${data.tab}`);
      if (action === 'send_message_by_name') triggerConfirmation('Message Sent');
    }
    return result;
  }, [handleAction, triggerConfirmation]);

  const toggle = async () => {
    if (!isOpen) {
      setIsOpen(true);
      const ass = new GeminiVoiceAssistant();
      assistantRef.current = ass;
      setIsListening(true);
      await ass.connect({
        onTranscript: (text, role, isFinal) => {
          if (!text.trim()) return;
          setMessages(prev => {
            let lastIndex = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === role && !prev[i].isFinal) {
                lastIndex = i;
                break;
              }
            }
            
            if (lastIndex !== -1) {
              const updated = [...prev];
              updated[lastIndex] = { text, role, isFinal };
              return updated;
            }
            return [...prev, { text, role, isFinal }];
          });
        },
        onAction: handleActionWithConfirmation
      });
    } else {
      assistantRef.current?.stop();
      setIsOpen(false);
      setIsListening(false);
      setMessages([]);
    }
  };

  return (
    <>
      {showConfirmation && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-blue-600 px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 z-[200] animate-in slide-in-from-top-4 backdrop-blur-3xl border border-white/10">
          <CheckCircle className="text-white" size={20} />
          <span className="font-bold text-white text-xs uppercase tracking-wider">{notificationText}</span>
        </div>
      )}
      <div className="fixed bottom-20 right-8 z-[100] group/fab">
        <button
          onClick={geminiApiKey ? toggle : undefined}
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-[0_32px_64px_-16px_rgba(59,130,246,0.5)] transition-all duration-500 ${
            !geminiApiKey
              ? 'bg-slate-700 cursor-not-allowed opacity-60'
              : isOpen
              ? 'bg-red-500 hover:scale-110 active:scale-90'
              : 'bg-blue-600 hover:scale-110 active:scale-90'
          }`}
        >
          {isOpen ? <X size={26} /> : geminiApiKey ? <Mic size={26} /> : <KeyRound size={22} />}
        </button>
        {!geminiApiKey && (
          <div className="absolute bottom-full right-0 mb-2 bg-slate-800 border border-white/10 text-white text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap shadow-xl opacity-0 group-hover/fab:opacity-100 transition-opacity pointer-events-none">
            Add API key in Settings
          </div>
        )}
      </div>
      {isOpen && (
        <div className="fixed bottom-40 right-8 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] bg-slate-900/95 backdrop-blur-3xl z-[90] flex flex-col rounded-2xl border border-white/10 shadow-2xl animate-in zoom-in-95">
          <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
               <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-blue-900/40"><Bot size={20} /></div>
               <div>
                  <h3 className="font-bold text-sm uppercase tracking-widest text-white">Durachok AI</h3>
                  <p className="text-xs text-blue-500 font-bold uppercase tracking-widest mt-0.5 italic">Sultan's Bro</p>
               </div>
            </div>
            <button onClick={toggle} className="p-2 text-slate-400 hover:text-white transition-colors"><Minimize2 size={18} /></button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-8 opacity-20 space-y-4">
                <Bot size={40} className="text-blue-500" />
                <p className="text-xs font-bold uppercase tracking-widest">Awaiting Sultan's Command</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex items-end space-x-3 ${m.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-xl shrink-0 flex items-center justify-center shadow-lg ${m.role === 'user' ? 'bg-blue-600' : 'bg-gray-800'}`}>{m.role === 'user' ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}</div>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed font-medium shadow-xl ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#1F2937] text-gray-200 border border-white/10 rounded-bl-none'}`}>{m.text}</div>
              </div>
            ))}
          </div>
          <div className="p-6 flex flex-col items-center shrink-0">
             <div className="flex items-center space-x-2 h-8">
               {[...Array(8)].map((_, i) => <div key={i} className="w-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_#3b82f6]" style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 100}ms` }} />)}
             </div>
          </div>
        </div>
      )}
    </>
  );
};
