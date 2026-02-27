
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, X, Bot, User, Minimize2, CheckCircle, Calendar, Edit3 } from 'lucide-react';
import { GeminiVoiceAssistant } from '../geminiService';
import { useAppStore, useAIActions } from '../store';
import { Job, Message, JobStatus } from '../types';

export const VoiceAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [notificationText, setNotificationText] = useState('');
  const [messages, setMessages] = useState<{ text: string, role: 'user' | 'assistant' }[]>([]);
  
  const assistantRef = useRef<GeminiVoiceAssistant | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { handleAction } = useAIActions();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const triggerConfirmation = useCallback((text: string = 'Success') => {
    setNotificationText(text);
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 3000);
  }, []);

  const handleActionWithConfirmation = useCallback(async (action: string, data: any) => {
    const result = await handleAction(action, data);
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
            const last = prev[prev.length - 1];
            if (last && last.role === role) {
              const updated = [...prev];
              updated[updated.length - 1] = { text, role };
              return updated;
            }
            return [...prev, { text, role }];
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
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-blue-600 px-8 py-4 rounded-[2rem] shadow-2xl flex items-center space-x-4 z-[200] animate-in slide-in-from-top-4 backdrop-blur-3xl border border-white/10">
          <CheckCircle className="text-white" size={20} />
          <span className="font-black text-white text-[10px] uppercase tracking-[0.2em]">{notificationText}</span>
        </div>
      )}
      <button onClick={toggle} className={`fixed bottom-24 right-10 w-20 h-20 rounded-full flex items-center justify-center shadow-[0_32px_64px_-16px_rgba(59,130,246,0.5)] z-[100] transition-all duration-500 hover:scale-110 active:scale-90 ${isOpen ? 'bg-red-500' : 'bg-blue-600'}`}>
        {isOpen ? <X size={32} /> : <Mic size={32} />}
      </button>
      {isOpen && (
        <div className="fixed bottom-48 right-10 w-[420px] max-w-[calc(100vw-3rem)] h-[600px] bg-[#111827]/95 backdrop-blur-3xl z-[90] flex flex-col rounded-[3.5rem] border border-white/10 shadow-2xl animate-in zoom-in-95">
          <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-5">
               <div className="w-12 h-12 bg-blue-600 rounded-[1.2rem] flex items-center justify-center text-white shadow-xl shadow-blue-900/40"><Bot size={24} /></div>
               <div>
                  <h3 className="font-black text-sm uppercase tracking-widest text-white">Durachok AI</h3>
                  <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest mt-1 italic">Sultan's Bro</p>
               </div>
            </div>
            <button onClick={toggle} className="p-3 text-gray-500 hover:text-white transition-colors"><Minimize2 size={20} /></button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-12 opacity-20 space-y-6">
                <Bot size={48} className="text-blue-500" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em]">Awaiting Sultan's Command</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex items-end space-x-4 ${m.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center shadow-lg ${m.role === 'user' ? 'bg-blue-600' : 'bg-gray-800'}`}>{m.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}</div>
                <div className={`max-w-[85%] px-6 py-5 rounded-[2rem] text-[13px] leading-relaxed font-medium shadow-xl ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#1F2937] text-gray-200 border border-white/5 rounded-bl-none'}`}>{m.text}</div>
              </div>
            ))}
          </div>
          <div className="p-10 flex flex-col items-center shrink-0">
             <div className="flex items-center space-x-2 h-8">
               {[...Array(8)].map((_, i) => <div key={i} className="w-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_#3b82f6]" style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 100}ms` }} />)}
             </div>
          </div>
        </div>
      )}
    </>
  );
};
