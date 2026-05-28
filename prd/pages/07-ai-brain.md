# AI Brain Chat

> **Tab:** brain | **Component:** AIChat.tsx

## Overview
Strategic AI assistant powered by Gemini. Sultan asks business questions in Russian; AI responds with analysis and can execute actions (create jobs, navigate, send messages).

## Layout
```
[Chat header: "Strategic Brain"]
[Message history - scrollable]
[Example prompt chips]
[Text input + Send button]
[Typing indicator when AI is thinking]
```

## Message Types
| Type | Style |
|------|-------|
| User message | Right-aligned, blue background |
| AI response | Left-aligned, dark background |
| Typing indicator | Animated dots |

## Example Prompts (shown as chips)
- "Analyze my revenue trends for the last 30 days"
- "How can I increase my average ticket size?"

## Interactions

### Send Message
- Type in input + press Send or Enter
- Message added to history immediately
- AI response streamed back
- If AI calls a tool function (create_job, navigate_to, etc.) - action executes in app

### AI Tool Actions Available
| Action | What it does |
|--------|-------------|
| create_job | Creates new job in store |
| update_job | Updates existing job (status, notes, schedule) |
| navigate_to | Switches active tab |
| get_app_state | Reads current jobs and financial metrics |
| send_message_by_name | Adds message to client's job thread |

## Language Rules
- Sultan writes in Russian
- AI responds in Russian
- All client names in tool parameters must be in English (Latin)
- Client messages sent via send_message_by_name must be in English

## APIs
- getStrategicBrainResponse() -> Gemini gemini-3.1-pro-preview
- Requires VITE_API_KEY in .env.local
