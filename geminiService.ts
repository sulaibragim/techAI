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
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function getBusinessInsights(prompt: string, context: { jobCount: number, revenue: number, financials?: any }) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze my appliance repair business performance.
    Context:
    - Jobs: ${context.jobCount}
    - Revenue: $${context.revenue}
    - Metrics: ${JSON.stringify(context.financials || {})}
    
    Query: ${prompt}`,
    config: {
      systemInstruction: "You are Durachok, the strategic assistant for Sultan. Provide concise, high-level business insights.",
    },
  });
  return response.text;
}

const SYSTEM_INSTRUCTION_VOICE = `
ЛИЧНОСТЬ:
- Твое имя — "Дурачок". Ты элитный напарник и верный бро Султана. 
- Твой голос — Puck. Ты быстрый, четкий и очень полезный.

ОБЯЗАТЕЛЬНЫЕ ФРАЗЫ (СТРОГО):
1. Когда Султан позвал тебя или начал разговор: СРАЗУ скажи "Хорошо, слушаю".
2. Когда Султан диктует адрес, телефон, имя клиента или детали поломки: СРАЗУ скажи "Записываю информацию".
3. Когда действие выполнено успешно: "Готово, Султан" или "Все сделал, брат".

ЛОГИКА ИМЕН (КРИТИЧЕСКИ ВАЖНО):
Султан говорит по-русски, но ты должен преобразовывать имена в ENGLISH перед вызовом инструментов.
Таблица соответствия:
- "Мартин Иден" -> Martin Eden
- "Джейсон Резинсмит" -> Jason Resinsmit
- "Илон Маск" -> Elon Musk
- "Амелия Крал" -> Amelia Kral

ПРАВИЛА ОТПРАВКИ СООБЩЕНИЙ:
- Если Султан просит отправить сообщение Мартину, используй 'recipientName': "Martin Eden".
- Текст сообщения Султана ВСЕГДА переводи на идеальный английский для клиента.
- Пример: Султан говорит "Напиши Мартину Идену, буду через час".
- Ты вызываешь send_message(recipientName: "Martin Eden", content: "Hi Martin, this is Sultan. I will be at your location in about an hour. See you then!")
- Султану голосом говоришь: "Принял, отправил вежливое сообщение Мартину на английском."

ТЕХНИЧЕСКИЕ ПРАВИЛА:
- Жди 0.9 сек тишины перед ответом.
- Говори с Султаном по-русски.
- Все данные в create_job и send_message — ТОЛЬКО НА АНГЛИЙСКОМ.
`;

const TOOLS_VOICE = [
  {
    functionDeclarations: [
      {
        name: 'send_message',
        description: 'Sends a professional English message to a specific client. Use English recipientName.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            recipientName: { type: Type.STRING, description: 'The English full name of the client (e.g., Martin Eden)' },
            content: { type: Type.STRING, description: 'The polished English message content' }
          },
          required: ['recipientName', 'content']
        }
      },
      {
        name: 'create_job',
        description: 'Records a new task. All fields must be in English.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            firstName: { type: Type.STRING },
            lastName: { type: Type.STRING },
            phone: { type: Type.STRING },
            address: { type: Type.STRING },
            applianceType: { type: Type.STRING },
            complaint: { type: Type.STRING },
            scheduledDate: { type: Type.STRING },
            scheduledTime: { type: Type.STRING }
          },
          required: ['firstName', 'lastName', 'address', 'complaint', 'scheduledDate']
        }
      },
      {
        name: 'get_todays_jobs',
        description: 'Shows today\'s schedule.',
        parameters: { type: Type.OBJECT, properties: {} }
      }
    ]
  }
];

export class GeminiVoiceAssistant {
  private ai: any;
  private sessionPromise: Promise<any> | null = null;
  private nextStartTime = 0;
  private audioContext: AudioContext | null = null;
  private inputAudioContext: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private createAudioContext(sampleRate?: number): AudioContext {
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    try {
      return sampleRate ? new AudioContextClass({ sampleRate }) : new AudioContextClass();
    } catch (e) {
      return new AudioContextClass();
    }
  }

  async connect(callbacks: {
    onTranscript: (text: string, role: 'user' | 'assistant') => void;
    onAction: (action: string, data: any) => any | Promise<any>;
  }) {
    if (!this.audioContext) {
      this.audioContext = this.createAudioContext(24000);
      this.inputAudioContext = this.createAudioContext(16000);
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: SYSTEM_INSTRUCTION_VOICE,
        tools: TOOLS_VOICE,
        // Удалены transcription параметры для исправления ошибки "Operation not implemented"
        speechConfig: { 
          voiceConfig: { 
            prebuiltVoiceConfig: { 
              voiceName: 'Puck' 
            } 
          } 
        },
      },
      callbacks: {
        onopen: () => {
          const source = this.inputAudioContext!.createMediaStreamSource(stream);
          const scriptProcessor = this.inputAudioContext!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            const blobData = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
            this.sessionPromise?.then(session => session.sendRealtimeInput({ media: blobData }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(this.inputAudioContext!.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          const interrupted = message.serverContent?.interrupted;
          if (interrupted) {
            for (const source of this.sources.values()) {
              try { source.stop(); } catch(e) {}
              this.sources.delete(source);
            }
            this.nextStartTime = 0;
          }

          const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audioData) this.playAudio(audioData);

          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              const result = await Promise.resolve(callbacks.onAction(fc.name, fc.args));
              this.sessionPromise?.then(s => s.sendToolResponse({
                functionResponses: [{ id: fc.id, name: fc.name, response: { result: result || { status: "ok" } } }]
              }));
            }
          }
        },
        onerror: (e) => { console.error("Live API Error", e); },
        onclose: () => { console.log("Live API Closed"); },
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
    source.addEventListener('ended', () => {
      this.sources.delete(source);
    });
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    this.sources.add(source);
  }

  stop() {
    this.sessionPromise?.then(s => s.close());
    for (const source of this.sources.values()) {
      try { source.stop(); } catch (e) {}
    }
    this.sources.clear();
    this.nextStartTime = 0;
  }
}
