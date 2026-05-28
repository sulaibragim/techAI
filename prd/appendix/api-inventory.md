# API Inventory

## Current State
The application has NO backend API. All data is in Zustand in-memory store.

## AI API Calls

### getStrategicBrainResponse()
- **Service:** Google Gemini
- **Model:** gemini-3.1-pro-preview
- **Trigger:** User sends message in AIChat
- **Input:** message string, conversation history, onAction callback
- **Output:** AI text response + optional tool call execution
- **Auth:** VITE_API_KEY environment variable

### GeminiVoiceAssistant.connect()
- **Service:** Google Gemini Live API
- **Model:** gemini-2.5-flash-native-audio-preview-09-2025
- **Trigger:** User opens Voice Assistant
- **Input:** Real-time 16kHz PCM audio stream
- **Output:** 24kHz audio + text transcripts + tool calls
- **Auth:** VITE_API_KEY environment variable

## AI Tool Functions (executed on client)
| Function | Parameters | Effect |
|----------|-----------|--------|
| create_job | firstName, lastName, phone, email, address, applianceType, brand, modelNumber, complaint, scheduledDate, scheduledTime | Adds job to Zustand store |
| update_job | jobId, status?, diagnosisNotes?, brand?, scheduledDate?, scheduledTime? | Updates job in store |
| navigate_to | tab (calendar/jobs/messages/calls/analytics/brain) | Changes activeTab in store |
| get_app_state | none | Returns jobs list + financial metrics |
| send_message_by_name | fullName, content | Adds message to matching client's job |

## Required Future APIs (for persistence)
The following APIs need to be built when a backend is added:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/jobs | GET | List all jobs |
| /api/jobs | POST | Create new job |
| /api/jobs/:id | GET | Get single job |
| /api/jobs/:id | PUT | Update job |
| /api/inventory | GET | List all parts |
| /api/inventory | POST | Add part |
| /api/inventory/:id | PUT | Update part |
| /api/messages | POST | Send message to client |
| /api/analytics | GET | Get financial metrics |
