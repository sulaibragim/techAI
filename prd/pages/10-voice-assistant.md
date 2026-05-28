# Voice Assistant (Floating)

> **Trigger:** Floating mic button (bottom-right) | **Component:** VoiceAssistant.tsx

## Overview
Real-time voice interface to Durachok AI. Sultan speaks Russian; AI responds in voice (Puck voice) and executes actions. Stays available on all tabs.

## Layout
```
[Floating mic button - always visible]
  -> [Expanded panel]
     [Header: "Durachok AI"]
     [Message history: user + assistant transcripts]
     [Live transcription indicator]
     [Close button]
```

## States
| State | Visual |
|-------|--------|
| Closed | Small floating mic button |
| Open / Idle | Panel shown, mic ready |
| Listening | Mic button active, transcribing user speech |
| AI Speaking | Audio playing from Gemini, transcript appears |

## Interactions

### Open
- Click floating button -> panel expands, Gemini session connects
- Microphone permission requested on first open

### Voice Input
- Audio streamed from device mic at 16kHz PCM
- Sent to Gemini in real-time chunks
- User speech transcribed and shown in panel

### AI Response
- Audio received at 24kHz, played via AudioContext
- 0.9s pause before each response starts playing
- Output transcribed and shown in panel
- If AI is interrupted -> current audio stops immediately

### Tool Execution
- AI calls functions (same 5 as AIChat)
- Action executes in app store
- Success notification shown briefly (bottom of panel)

### Close
- Stop button -> closes Gemini session, hides panel

## Technical
- Model: gemini-2.5-flash-native-audio-preview-09-2025
- Voice: Puck
- Input: 16kHz mono PCM via ScriptProcessorNode
- Output: 24kHz mono PCM via AudioBufferSourceNode
- Thinking: HIGH level enabled

## Language Rules
Same as AIChat - Russian with Sultan, English for all client data
