import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, X, MessageSquare, CheckCircle, Bot, User, Minimize2, Camera, Mail, Smartphone } from 'lucide-react';
import { GeminiVoiceAssistant } from '../geminiService';
import { useAppStore } from '../store';
import { Job, Message } from '../types';

export const VoiceAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationType, setConfirmationType] = useState<'job' | 'notification'>('job');
  const [notificationText, setNotificationText] = useState('');
  const [messages, setMessages] = useState<{ text: string, role: 'user' | 'assistant' }[]>([]);
  
  const assistantRef = useRef<GeminiVoiceAssistant | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { addJob, jobs, addMessageToJob } = useAppStore();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const triggerConfirmation = useCallback((type: 'job' | 'notification', text: string = '') => {
    setConfirmationType(type);
    setNotificationText(text);
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 4000);
  }, []);

  const handleAction = useCallback((action: string, data: any) => {
    if (action === 'send_message') {
      let target;
      
      // УЛЬТРА-ГИБКИЙ ПОИСК ПО ИМЕНИ
      if (data.recipientName) {
        const search = data.recipientName.toLowerCase().trim();
        target = jobs.find(j => {
          const fullName = `${j.client.firstName} ${j.client.lastName}`.toLowerCase();
          const fName = j.client.firstName.toLowerCase();
          const lName = j.client.lastName.toLowerCase();
          
          return (
            fullName.includes(search) || 
            search.includes(fName) || 
            search.includes(lName) ||
            fName.includes(search) ||
            lName.includes(search)
          );
        });
        
        if (!target) {
          console.error(`Client not found: ${data.recipientName}`);
          return { error: `Client '${data.recipientName}' not found in dispatch queue.` };
        }
      } else {
        // Если имя не передано, ищем активный заказ
        target = jobs.find(j => j.status === 'enRoute' || j.status === 'diagnosed');
      }

      if (target) {
        const msg: Message = {
          id: Math.random().toString(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sender: 'technician',
          content: data.content,
          method: 'sms'
        };
        addMessageToJob(target.id, msg);
        triggerConfirmation('notification', `Sent to ${target.client.firstName}`);
        return { status: "sent", target: `${target.client.firstName} ${target.client.lastName}` };
      }
      return { error: "No client could be identified." };
    }

    if (action === 'get_todays_jobs') {
      const today = new Date().toISOString().split('T')[0];
      const todaysJobs = jobs.filter(j => j.scheduledDate === today);
      return { 
        count: todaysJobs.length, 
        jobs: todaysJobs.map(j => ({
          client: `${j.client.firstName} ${j.client.lastName}`,
          time: j.scheduledTime,
          status: j.status
        }))
      };
    }

    if (action === 'create_job') {
      const initials = (data.firstName?.[0] || 'X') + (data.lastName?.[0] || 'Y');
      const numPart = Math.floor(1000 + Math.random() * 9000).toString();
      
      const newJob: Job = {
        id: Math.random().toString(),
        jobNumber: `${numPart}${initials.toUpperCase()}`,
        client: {
          id: Math.random().toString(),
          firstName: data.firstName || 'Unknown',
          lastName: data.lastName || 'Client',
          phone: data.phone || 'N/A',
          email: '',
          address: data.address || 'N/A'
        },
        appliance: {
          type: (data.applianceType as any) || 'Other',
          brand: '',
          modelNumber: ''
        },
        complaint: data.complaint || 'Voice Intake',
        diagnosisNotes: '',
        scheduledDate: data.scheduledDate || new Date().toISOString().split('T')[0],
        scheduledTime: data.scheduledTime || '09:00',
        status: 'scheduled',
        lineItems: [],
        paymentStatus: 'unpaid',
        totalAmount: 0,
        photos: [], 
        messages: []
      };
      addJob(newJob);
      triggerConfirmation('job');
      return { status: "success", jobNumber: newJob.jobNumber };
    }
  }, [jobs, addJob, addMessageToJob, triggerConfirmation]);

  const toggle = async () => {
    if (!isOpen) {
      setIsOpen(true);
      const ass = new GeminiVoiceAssistant();
      assistantRef.current = ass;
      setIsListening(true);
      await ass.connect({
        onTranscript: (text, role) => {
          setMessages(prev => [...prev, { text, role }]);
        },
        onAction: handleAction
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
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 ${confirmationType === 'job' ? 'bg-green-600' : 'bg-blue-600'} px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 z-[200] animate-in fade-in slide-in-from-top-4`}>
          <CheckCircle size={20} className="text-white" />
          <span className="font-bold text-white text-sm uppercase tracking-widest">
            {confirmationType === 'job' ? 'Saved' : notificationText}
          </span>
        </div>
      )}

      <button
        onClick={toggle}
        className={`fixed bottom-24 right-6 md:right-10 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all z-[100] ${isOpen ? 'bg-red-500' : 'bg-blue-600 hover:scale-105 active:scale-95'}`}
      >
        {isOpen ? <X size={28} /> : <Mic size={28} />}
      </button>

      {isOpen && (
        <div className="fixed bottom-44 right-6 md:right-10 w-[380px] max-w-[calc(100vw-3rem)] h-[550px] bg-[#111827]/95 backdrop-blur-2xl z-[90] flex flex-col rounded-[3rem] border border-white/10 shadow-2xl animate-in slide-in-from-bottom-12">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white"><Bot size={22} /></div>
              <div>
                <h3 className="font-black text-sm uppercase tracking-widest text-white">Durachok AI</h3>
                <p className="text-[9px] text-blue-400 font-black uppercase tracking-widest mt-1">Sultan's Bro</p>
              </div>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-10 opacity-30">
                <Bot size={32} className="mb-4 text-blue-500" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">"Durachok, send message to Martin Eden."</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex items-end space-x-3 ${m.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${m.role === 'user' ? 'bg-blue-600' : 'bg-gray-800'}`}>{m.role === 'user' ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}</div>
                <div className={`max-w-[85%] px-5 py-4 rounded-[1.5rem] text-[13px] font-medium ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#1F2937] text-gray-200 border border-white/5 rounded-bl-none'}`}>{m.text}</div>
              </div>
            ))}
          </div>
          <div className="p-8 flex flex-col items-center">
            <div className="flex items-center space-x-1.5 h-6">
              {[...Array(8)].map((_, i) => <div key={i} className={`w-1 rounded-full bg-blue-500 ${isListening ? 'animate-pulse' : 'opacity-10'}`} style={{ height: isListening ? `${20 + Math.random() * 80}%` : '4px' }} />)}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
