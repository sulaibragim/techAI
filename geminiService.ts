
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

/**
 * Generates business insights using Gemini 3 Pro.
 */
export async function getBusinessInsights(prompt: string, context: { jobCount: number; revenue: number; financials: any }) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
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

const SYSTEM_INSTRUCTION_VOICE = `
ЛИЧНОСТЬ:
- Твое имя — "Дурачок". Ты элитный напарник Султана. 
- Твой голос — Puck. Ты быстрый, четкий и очень полезный. Говоришь по-русски.

ОБЯЗАТЕЛЬНЫЕ ФРАЗЫ:
1. "Хорошо, слушаю" — начало разговора.
2. "Записываю информацию" — прием данных.
3. "Готово, Султан" или "Все сделал, брат" — успех.

ИНСТРУМЕНТЫ:
- 'change_job_status': Изменяет статус (completed/cancelled/diagnosed).
- 'update_job_details': Обновляет бренд, имена, телефоны.
- 'send_message': Шлет SMS клиенту на английском.
- 'find_job_by_client_name': Ищет запись по имени.
`;

const TOOLS_VOICE = [
  {
    functionDeclarations: [
      {
        name: 'change_job_status',
        description: 'Changes the workflow status of a job record.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            clientName: { type: Type.STRING },
            newStatus: { type: Type.STRING, enum: ['diagnosed', 'waitingParts', 'completed', 'cancelled'] }
          },
          required: ['clientName', 'newStatus']
        }
      },
      {
        name: 'find_job_by_client_name',
        description: 'Locates a job by searching for the client name.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            clientName: { type: Type.STRING }
          },
          required: ['clientName']
        }
      },
      {
        name: 'update_job_details',
        description: 'Modifies specific fields of an existing record.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            clientName: { type: Type.STRING },
            brand: { type: Type.STRING },
            newFirstName: { type: Type.STRING },
            newLastName: { type: Type.STRING },
            newPhone: { type: Type.STRING }
          },
          required: ['clientName']
        }
      },
      {
        name: 'send_message',
        description: 'Sends a system notification SMS to a client.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            recipientName: { type: Type.STRING },
            content: { type: Type.STRING }
          },
          required: ['recipientName', 'content']
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
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: SYSTEM_INSTRUCTION_VOICE,
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
          if (message.serverContent?.turnComplete) {
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
              this.sessionPromise?.then(s => s.sendToolResponse({
                functionResponses: [{ id: fc.id, name: fc.name, response: { result: result || { status: "ok" } } }]
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
