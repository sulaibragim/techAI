
import { GoogleGenAI, Modality, Type, LiveServerMessage, ThinkingLevel } from "@google/genai";
import { useSettingsStore } from './settingsStore';

const resolveApiKey = (): string => {
  const key = useSettingsStore.getState().geminiApiKey || import.meta.env.VITE_API_KEY || '';
  if (!key) throw new Error('Gemini API key not configured. Go to Settings → AI Configuration to add your key.');
  return key;
};

export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function encode(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  const chunks = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize))));
  }
  return btoa(chunks.join(''));
}

/**
 * Generates strategic responses with tool support for the chat interface.
 */
export async function getStrategicBrainResponse(
  message: string, 
  history: { text: string, role: 'user' | 'model' }[],
  callbacks: { onAction: (action: string, data: any) => any | Promise<any> }
) {
  const ai = new GoogleGenAI({ apiKey: resolveApiKey() });

  const contents: any[] = history.map(h => ({
    role: h.role,
    parts: [{ text: h.text }]
  }));
  contents.push({ role: 'user', parts: [{ text: message }] });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents,
    config: {
      systemInstruction: getSystemInstruction(),
      tools: TOOLS_VOICE,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
    },
  });

  const functionCalls = response.functionCalls;
  if (functionCalls) {
    const results: any[] = [];
    for (const fc of functionCalls) {
      const result = await Promise.resolve(callbacks.onAction(fc.name, fc.args));
      results.push({
        functionResponse: {
          id: fc.id,
          name: fc.name,
          response: { result: result || { status: "ok" } }
        }
      });
    }
    
    // Send back the results to get the final text response
    const secondResponse = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        ...contents,
        { role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) },
        { role: 'user', parts: results }
      ],
      config: {
        systemInstruction: getSystemInstruction(),
        tools: TOOLS_VOICE,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });
    return secondResponse.text;
  }

  return response.text;
}

/**
 * Generates business insights using Gemini 3 Pro.
 */
export async function getBusinessInsights(prompt: string, context: { jobCount: number; revenue: number; financials: any }) {
  const ai = new GoogleGenAI({ apiKey: resolveApiKey() });
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      systemInstruction: `You are a world-class strategic consultant for Salem AI.
Context:
- Jobs: ${context.jobCount}
- Revenue: $${context.revenue}
- Detailed Metrics: ${JSON.stringify(context.financials)}

Tone: Elite, Actionable, Data-driven.`,
    },
  });
  return response.text;
}

const getSystemInstruction = () => `
ЛИЧНОСТЬ:
- Твое имя — "Дурачок". Ты элитный напарник Султана. 
- Твой голос — Puck. Ты быстрый, четкий и очень полезный. 
- Ты общаешься с Султаном (работодателем) на русском языке.
- ТЫ ДОЛЖЕН ДУМАТЬ НА АНГЛИЙСКОМ ЯЗЫКЕ. Вся внутренняя логика, поиск клиентов и работа с данными происходят на английском.
- Ты знаешь всё о бизнесе Султана: работы, клиенты, финансы, звонки.
- Веди диалог естественно, как живой человек. Будь лаконичным, дружелюбным и логичным.

ТВОИ ВОЗМОЖНОСТИ:
1. СОЗДАНИЕ РАБОТ: Ты можешь создавать новые записи о работах. Все имена клиентов, адреса и описания должны быть на АНГЛИЙСКОМ. Например, если Султан говорит "Джек Лондон", ты записываешь "Jack London".
2. УПРАВЛЕНИЕ ДАННЫМИ: Ты можешь менять любую информацию в существующих работах.
3. ПОИСК: Ты можешь находить информацию о работах и клиентах. Поиск имен ведется на АНГЛИЙСКОМ. Если Султан просит найти "Джека Лондона", ты ищешь "Jack London".
4. НАВИГАЦИЯ: Ты можешь переключать вкладки приложения.
5. КОММУНИКАЦИЯ: Ты можешь отправлять сообщения клиентам. 

ПРАВИЛА ИСПОЛЬЗОВАНИЯ ИНСТРУМЕНТОВ (КРИТИЧЕСКИ ВАЖНО):
- ТЫ ОБЯЗАН ВЫЗЫВАТЬ ИНСТРУМЕНТЫ ДЛЯ ЛЮБОГО ДЕЙСТВИЯ. 
- НИКОГДА не говори Султану, что ты что-то сделал (отправил сообщение, изменил статус, создал работу), если ты НЕ вызвал соответствующую функцию в этом же ответе.
- ТЫ НЕ ДОЛЖЕН ПЕРЕСПРАШИВАТЬ РАЗРЕШЕНИЯ. Если Султан сказал "отправь", "отмени", "измени" — выполняй это немедленно, вызывая нужный инструмент.
- Если Султан просит отменить встречу или изменить статус, ты ДОЛЖЕН вызвать 'update_job'. 
- Если ты не знаешь ID работы для 'update_job', ты ОБЯЗАН сначала вызвать 'get_app_state', чтобы найти ID по имени клиента (на английском). Не пытайся угадать ID.
- Если Султан просит отправить сообщение, ты ДОЛЖЕН вызвать 'send_message_by_name'.
- Если Султан говорит "отмени встречу с Мартином", это значит: 1) Найти ID работы через 'get_app_state', 2) Вызвать 'update_job' со статусом 'cancelled', 3) Вызвать 'send_message_by_name', чтобы вежливо уведомить клиента на английском.
- Если Султан говорит "напиши Джеку Лондону", ты вызываешь 'send_message_by_name' ОБЯЗАТЕЛЬНО c параметром fullName="Jack London" (переведи на английский язык). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ПЕРЕДАВАТЬ ИМЕНА В ПАРАМЕТРЫ ФУНКЦИЙ НА РУССКОМ ЯЗЫКЕ.

ПРАВИЛА ОБЩЕНИЯ И ЯЗЫКОВАЯ ПОЛИТИКА:
- С Султаном (работодателем) ты говоришь ТОЛЬКО на русском языке.
- С КЛИЕНТАМИ (американцами) всё общение, поиск и записи ведутся ТОЛЬКО НА АНГЛИЙСКОМ ЯЗЫКЕ.
- Когда ты отправляешь сообщение клиенту через инструмент 'send_message_by_name', текст сообщения (параметр content) ДОЛЖЕН БЫТЬ НА АНГЛИЙСКОМ.
- Внимательно проверяй параметры функций: 'fullName', 'firstName', 'lastName' ВСЕГДА должны передаваться латиницей (на английском).
- Сообщения клиентам должны быть вежливыми, профессиональными и соответствовать контексту (например, при отмене встречи вырази сожаление и предложи связаться позже).
- НИКОГДА не повторяй вслух текст отправленного сообщения. Просто подтверди Султану на русском, что действие выполнено (например: "Всё, я отправил сообщение", "Отменил и написал ему").
- Текущее время и дата: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}. Хотя ты говоришь с Султаном по-русски, используй английский формат даты/времени для внутренней логики.

ИНСТРУМЕНТЫ:
- 'create_job': Создает новую работу.
- 'update_job': Обновляет существующую работу (включая статус 'cancelled').
- 'navigate_to': Переходит на вкладку.
- 'get_app_state': Получает текущее состояние (список работ, ID работ, статистику).
- 'send_message_by_name': Отправляет сообщение клиенту по имени.
`;

const TOOLS_VOICE = [
  {
    functionDeclarations: [
      {
        name: 'create_job',
        description: 'Creates a new job record with full details.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            firstName: { type: Type.STRING },
            lastName: { type: Type.STRING },
            phone: { type: Type.STRING },
            email: { type: Type.STRING },
            address: { type: Type.STRING },
            applianceType: { type: Type.STRING },
            brand: { type: Type.STRING },
            modelNumber: { type: Type.STRING },
            complaint: { type: Type.STRING },
            scheduledDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
            scheduledTime: { type: Type.STRING, description: 'HH:MM' }
          },
          required: ['firstName', 'lastName', 'phone', 'applianceType', 'complaint']
        }
      },
      {
        name: 'update_job',
        description: 'Updates an existing job record.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            jobId: { type: Type.STRING },
            status: { type: Type.STRING, enum: ['scheduled', 'enRoute', 'onSite', 'diagnosed', 'waitingParts', 'completed', 'cancelled'] },
            diagnosisNotes: { type: Type.STRING },
            brand: { type: Type.STRING },
            modelNumber: { type: Type.STRING },
            serialNumber: { type: Type.STRING },
            scheduledDate: { type: Type.STRING },
            scheduledTime: { type: Type.STRING }
          },
          required: ['jobId']
        }
      },
      {
        name: 'navigate_to',
        description: 'Navigates to a specific tab in the application.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            tab: { type: Type.STRING, enum: ['calendar', 'jobs', 'messages', 'calls', 'analytics', 'brain'] }
          },
          required: ['tab']
        }
      },
      {
        name: 'get_app_state',
        description: 'Retrieves the current state of the application including all jobs (with scheduled dates/times) and financial metrics (revenue, targets, progress).',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'send_message_by_name',
        description: 'Sends a professional message to a client identified by their full name.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            fullName: { type: Type.STRING, description: 'First and Last name of the client' },
            content: { type: Type.STRING, description: 'The content of the message' }
          },
          required: ['fullName', 'content']
        }
      }
    ]
  }
];

export class GeminiVoiceAssistant {
  private sessionPromise: Promise<any> | null = null;
  private nextStartTime = 0;
  private audioContext: AudioContext | null = null;
  private inputAudioContext: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private currentInputTranscription = '';
  private currentOutputTranscription = '';
  
  constructor() {}

  async connect(callbacks: {
    onTranscript: (text: string, role: 'user' | 'assistant', isFinal: boolean) => void;
    onAction: (action: string, data: any) => any | Promise<any>;
  }) {
    const ai = new GoogleGenAI({ apiKey: resolveApiKey() });
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: getSystemInstruction(),
        tools: TOOLS_VOICE,
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      },
      callbacks: {
        onopen: () => {
          const source = this.inputAudioContext!.createMediaStreamSource(stream);
          const scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            this.sessionPromise?.then(session => session.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(this.inputAudioContext!.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.outputTranscription) {
            this.currentOutputTranscription += message.serverContent.outputTranscription.text;
            callbacks.onTranscript(this.currentOutputTranscription, 'assistant', false);
          } else if (message.serverContent?.inputTranscription) {
            this.currentInputTranscription += message.serverContent.inputTranscription.text;
            callbacks.onTranscript(this.currentInputTranscription, 'user', false);
          }
          if (message.serverContent?.interrupted) {
            this.sources.forEach(source => {
              try { source.stop(); } catch (e) {}
            });
            this.sources.clear();
            this.nextStartTime = this.audioContext?.currentTime || 0;
          }
          if (message.serverContent?.turnComplete || message.serverContent?.interrupted) {
            if (this.currentInputTranscription) {
              callbacks.onTranscript(this.currentInputTranscription, 'user', true);
              this.currentInputTranscription = '';
            }
            if (this.currentOutputTranscription) {
              callbacks.onTranscript(this.currentOutputTranscription, 'assistant', true);
              this.currentOutputTranscription = '';
            }
          }
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) this.playAudio(audioData);
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              const result = await Promise.resolve(callbacks.onAction(fc.name, fc.args));
              // Corrected sendToolResponse: functionResponses should be an object, not an array, as per GenAI SDK documentation
              this.sessionPromise?.then(s => s.sendToolResponse({
                functionResponses: [{
                  id: fc.id,
                  name: fc.name,
                  response: { result: result || { status: "ok" } },
                }]
              }));
            }
          }
        },
        onerror: (e) => console.error(e),
        onclose: () => console.log("Voice Offline"),
      }
    });
  }

  private async playAudio(base64: string) {
    if (!this.audioContext) return;
    
    // Add a 0.9s pause before starting a new response
    if (this.nextStartTime <= this.audioContext.currentTime) {
      this.nextStartTime = this.audioContext.currentTime + 0.9;
    } else {
      this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    }
    
    const audioBuffer = await decodeAudioData(decode(base64), this.audioContext, 24000, 1);
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  stop() {
    this.sessionPromise?.then(s => s.close());
  }
}
