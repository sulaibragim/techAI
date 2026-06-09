import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.VITE_API_KEY });

const SYSTEM_PROMPT = `You are a CRM assistant for TrustKey Locksmith AZ.
Extract job details from a call transcript and return ONLY valid JSON.

JSON shape:
{
  "clientName": string,
  "clientPhone": string,
  "address": string,
  "serviceType": "residential" | "automotive" | "commercial",
  "lockType": string,
  "vehicleMake": string | null,
  "vehicleModel": string | null,
  "vehicleYear": string | null,
  "problemDescription": string,
  "urgency": "standard" | "urgent" | "emergency",
  "estimatedPrice": number | null,
  "notes": string,
  "callSummary": string,
  "callQuality": {
    "rating": "excellent" | "good" | "needs_improvement" | "poor",
    "strengths": string[],
    "improvements": string[],
    "missedInfo": string[]
  }
}

Rules:
- clientPhone: use the caller number if not mentioned in transcript
- estimatedPrice: null if not discussed
- lockType: be specific (e.g. "deadbolt", "car ignition", "safe", "smart lock", "padlock")
- vehicleMake: car brand if automotive (e.g. "Toyota", "Ford", "BMW"). null if not automotive
- vehicleModel: car model if mentioned (e.g. "Camry", "F-150"). null if not automotive
- vehicleYear: year if mentioned (e.g. "2019"). null if not mentioned
- urgency: "emergency" if locked out now, "urgent" if same-day, "standard" otherwise
- notes: anything else relevant (gate code, unit number, dog, parking spot, etc.)
- callSummary: Write a 3-5 sentence professional summary of the call. Include: what the client needs, what was discussed, what was agreed upon (time, price if any), and any special instructions. This is for the manager to review.
- callQuality: Evaluate how well the dispatcher/manager handled the call:
  - rating: overall quality
  - strengths: what was done well (e.g. "confirmed address", "gave ETA", "offered price range")
  - improvements: what could be better (e.g. "didn't ask about vehicle year", "didn't confirm callback number")
  - missedInfo: important details that were NOT collected during the call (e.g. "vehicle VIN", "gate code", "parking instructions")`;

export async function processTranscriptWithAI(transcript, callerPhone) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
    console.error('[Gemini] transcript processing error:', err?.message);
    return null;
  }
}
