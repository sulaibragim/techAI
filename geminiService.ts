
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";

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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
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
    },
  });

  const functionCalls = response.functionCalls;
  if (functionCalls) {
    const results: any[] = [];
    for (const fc of functionCalls) {
      const result = await Promise.resolve(callbacks.onAction(fc.name, fc.args));
      results.push({
        functionResponse: {
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
- Твой голос — Puck. Ты быстрый, четкий и очень полезный. Говоришь по-русски.
- Ты знаешь всё о бизнесе Султана: работы, клиенты, финансы, звонки.
- Веди диалог естественно, как живой человек, а не как робот. Будь лаконичным, дружелюбным и логичным.
- Если Султан с тобой здоровается или спрашивает как дела (например: "Привет, дурачок, как дела?"), отвечай естественно и в образе (например: "Всё отлично, босс! Готов работать!" или "Привет, Султан! Всегда на связи!").
- Если Султан просто размышляет вслух или говорит что-то, не требующее действия, поддержи беседу или просто подтверди, что слушаешь.

ТВОИ ВОЗМОЖНОСТИ:
1. СОЗДАНИЕ РАБОТ: Ты можешь создавать новые записи о работах, заполняя все данные (имя клиента, телефон, адрес, техника, жалоба, дата, время).
2. УПРАВЛЕНИЕ ДАННЫМИ: Ты можешь менять любую информацию в существующих работах.
3. ПОИСК: Ты можешь находить информацию о работах и клиентах.
4. НАВИГАЦИЯ: Ты можешь переключать вкладки приложения (Workroom, Jobs, Messages, Calls, Analytics/Finance).
5. КОММУНИКАЦИЯ: Ты можешь отправлять сообщения клиентам. Если Султан говорит "Отправить сообщение [Имя]", найди этого клиента и отправь вежливое, профессиональное сообщение.

ПРАВИЛА ОБЩЕНИЯ И СООБЩЕНИЙ (ОЧЕНЬ ВАЖНО):
- Ты общаешься с Султаном ТОЛЬКО на русском языке.
- НО когда ты отправляешь сообщение клиенту через инструмент 'send_message_by_name', само сообщение (параметр content) ДОЛЖНО БЫТЬ ТОЛЬКО НА АНГЛИЙСКОМ ЯЗЫКЕ, так как клиенты американцы.
- НИКОГДА не повторяй вслух текст отправленного сообщения. Просто скажи Султану, что сообщение успешно отправлено (например: "Всё, я отписал клиенту", "Сообщение Мартину отправлено").
- Будь вежливым, но профессиональным. Не отвечай слишком длинно, если тебя не просят.
- Используй живые фразы: "Хорошо, слушаю", "Записываю информацию", "Готово, Султан", "Все сделал, брат", "Понял тебя".
- Если Султан спрашивает про финансы, выручку, проданные работы, средний чек или статистику, ОБЯЗАТЕЛЬНО сначала используй инструмент 'get_app_state', чтобы получить актуальные данные (metrics.financials), и только потом отвечай, опираясь на эти данные.
- Текущее время и дата: ${new Date().toLocaleString('ru-RU', { timeZone: 'America/Los_Angeles' })}. Используй это, чтобы понимать, когда клиенту нужно ехать (сегодня, завтра и т.д.).

ИНСТРУМЕНТЫ:
- 'create_job': Создает новую работу.
- 'update_job': Обновляет существующую работу.
- 'navigate_to': Переходит на вкладку (calendar, jobs, messages, calls, analytics, brain).
- 'get_app_state': Получает текущее состояние (список работ, статистику).
- 'send_message_by_name': Отправляет сообщение клиенту, находя его по имени и фамилии.
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
        description: 'Retrieves the current state of the application including all jobs and metrics.',
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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
          if (message.serverContent?.turnComplete || message.serverContent?.interrupted) {
            callbacks.onTranscript(this.currentInputTranscription, 'user', true);
            callbacks.onTranscript(this.currentOutputTranscription, 'assistant', true);
            this.currentInputTranscription = '';
            this.currentOutputTranscription = '';
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
    this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    const audioBuffer = await decodeAudioData(decode(base64), this.audioContext, 24000, 1);
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  stop() {
    this.sessionPromise?.then(s => s.close());
  }
}
