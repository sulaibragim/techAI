import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const ai = new GoogleGenAI({ apiKey: process.env.VITE_API_KEY });

const SYSTEM_PROMPT = `You are a CRM assistant for TrustKey Locksmith AZ.
Extract job details from a call transcript and return ONLY valid JSON.

JSON shape:
{
  "clientName": string,
  "clientPhone": string,
  "address": string,
  "serviceType": "residential" | "automotive" | "commercial",
  "lockType": string,
  "problemDescription": string,
  "urgency": "standard" | "urgent" | "emergency",
  "estimatedPrice": number | null,
  "notes": string
}

Rules:
- clientPhone: use the caller number if not mentioned in transcript
- estimatedPrice: null if not discussed
- lockType: be specific (e.g. "deadbolt", "car door", "safe", "mailbox")
- urgency: "emergency" if locked out now, "urgent" if same-day, "standard" otherwise
- notes: anything else relevant (gate code, unit number, dog, etc.)`;

export async function processTranscriptWithAI(transcript, callerPhone) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [{
            text: `Caller phone: ${callerPhone}\n\nTranscript:\n${transcript}`,
          }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    return JSON.parse(text);
  } catch (err) {
    console.error('[Gemini] transcript processing error:', err);
    return null;
  }
}
