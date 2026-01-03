# Data Flow Architecture

## Overview

This document describes how data flows through the Storyloop application, from user interactions to data persistence and back.

## Request-Response Flow

### 1. Health Check Flow

```
User Browser
    │
    │ Display Health Badge
    │
    ▼
App.tsx (HealthBadge component)
    │
    │ useQuery(healthQueries.status())
    │
    ▼
TanStack Query Cache
    │
    │ Check cache, fetch if stale
    │
    ▼
api/health.ts (queryFn)
    │
    │ GET /health
    │
    ▼
Axios Client (api/client.ts)
    │
    │ HTTP Request
    │ headers: Content-Type: application/json
    │ timeout: 10s
    │
    ▼
Network (CORS enabled)
    │
    │ http://localhost:8000/health
    │
    ▼
FastAPI Backend (main.py)
    │
    │ CORS Middleware validation
    │
    ▼
Router (routers/health.py)
    │
    │ @router.get("/health")
    │
    ▼
Response { status: "healthy" }
    │
    │ ↑ HTTP Response
    │
    ▼
TanStack Query
    │
    │ Update cache
    │
    ▼
React Component
    │
    │ Re-render with new data
    │
    ▼
UI Update (Badge shows "API ready")
```

### 2. Journal Entry Creation Flow

```
User clicks "+ entry"
    │
    ▼
ActivityFeed.tsx
    │
    │ onStartDraft()
    │
    ▼
App.tsx (JournalPage)
    │
    │ setDraft({ title: "", summary: "", date: now })
    │
    ▼
ActivityDraftCard
    │
    │ User fills form
    │   - Title input
    │   - Summary textarea (markdown)
    │   - Date/time picker
    │
    ▼
onSubmitDraft()
    │
    │ handleSubmitDraft()
    │   - Validate title
    │   - Generate UUID
    │   - Build CreateEntryInput
    │   - mutateAsync(createEntry)
    │
    ▼
api/entries.ts
    │
    │ POST /entries
    │ body: [{ id, title, summary, date, category }]
    │
    ▼
Backend Router (routers/entries.py)
    │
    │ Save to SQLite (EntryService)
    │
    ▼
Response: saved entry
    │
    ▼
React Query cache update
    │
    │ setQueryData(entries)
    │ setDraft(null)
    │
    ▼
ActivityFeed Re-renders
    │
    │ New entry appears at top
```

**Notes:**

- Journal summaries are markdown strings that can include `/assets/{id}` links for attachments.

### 3. Asset Upload Flow (Journal + Loopie)

```
User adds image/PDF
    │
    ▼
ActivityDraftCard / LoopiePanel
    │
    │ useAssetUpload()
    │
    ▼
api/assets.ts
    │
    │ POST /assets or POST /assets/{hash}
    │ form-data: file
    │
    ▼
Backend Router (routers/assets.py)
    │
    │ AssetService.create_asset()
    │ - Resize images
    │ - Extract PDF text
    │ - Save file to disk
    │ - Store metadata in SQLite
    │
    ▼
Response: asset metadata
    │
    ▼
Frontend inserts snippet
    │
    │ Journal: ![alt](/assets/{id}) or [file](/assets/{id})
    │ Loopie: attachment list before send
```

### 4. Dictation Flow (Journal + Loopie)

```
User taps dictation button
    │
    ▼
ActivityDraftCard / LoopiePanel
    │
    │ useDictation()
    │ - MediaRecorder captures audio
    │ - Stop button ends recording
    │
    ▼
api/dictation.ts
    │
    │ POST /dictation/transcribe (multipart audio)
    │
    ▼
Backend Router (routers/dictation.py)
    │
    │ DictationService.transcribe_audio()
    │ - OpenAI transcription model
    │
    ▼
Response: { text }
    │
    ▼
Frontend appends transcript
    │
    ├─ Journal: summary textarea (append with spacing)
    └─ Loopie: composer input (no auto-send)
    │
    ▼
Journal-only title generation
    │
    │ POST /dictation/title (body text)
    │
    ▼
DictationService.generate_title()
    │
    │ GPT-5 mini returns title
    │
    ▼
Frontend updates title (if untouched)
```

## Background Job Flow

### Weekly YouTube Sync

```
APScheduler (scheduler.py)
    │
    │ Cron: Every Sunday 3:00 AM UTC
    │
    ▼
Trigger Job
    │
    │ scheduler.add_job(youtube_sync_job)
    │
    ▼
YoutubeService.sync_latest_metrics()
    │
    │ [Future Implementation]
    │ 1. Authenticate with YouTube API using OAuth 2.0
    │    - See: https://googleapis.github.io/google-api-python-client/docs/oauth-installed.html
    │    - Load stored credentials or initiate OAuth flow
    │    - Use google-auth-oauthlib.flow.InstalledAppFlow
    │    - Reference implementation in scripts/example_script.py
    │ 2. Fetch latest video metrics
    │    - View count
    │    - Watch time
    │    - CTR (Click-Through Rate)
    │    - Average view duration
    │    - Retention curves
    │ 3. Transform data
    │ 4. Store in database
    │
    ▼
Database Update
    │
    │ INSERT/UPDATE youtube_metrics
    │
    ▼
Log Result
    │
    │ logger.info("YouTube sync completed")
    │
    ▼
Job Complete
```

### Daily Growth Score Calculation

```
APScheduler
    │
    │ Cron: Daily 1:00 AM UTC
    │
    ▼
Trigger Job
    │
    │ scheduler.add_job(growth_score_job)
    │
    ▼
GrowthScoreService.recalculate_growth_score()
    │
    │ [Future Implementation]
    │ 1. Fetch recent metrics
    │ 2. Calculate: CTR × (Avg Duration ÷ Length)
    │ 3. Track trends
    │ 4. Generate insights
    │ 5. Store results
    │
    │ See [thinking/insights.md](insights.md) for the full scoring and insights logic.
    │
    ▼
Database Update
    │
    │ INSERT/UPDATE growth_scores
    │
    ▼
Log Result
    │
    │ logger.info("Growth score recalculated")
    │
    ▼
Job Complete
```

## Application Lifespan Flow

### Startup Sequence

```
Server Start
    │
    ▼
create_app() called
    │
    │ 1. Configure logging
    │ 2. Configure Logfire
    │ 3. Create connection factory
    │ 4. Build lifespan handler
    │
    ▼
build_lifespan()
    │
    │ Initialize services:
    │ - UserService
    │ - EntryService
    │ - AssetService
    │ - YoutubeService
    │ - GrowthScoreService
    │ - Assistant agent (optional)
    │
    ▼
Scheduler Setup
    │
    │ if scheduler_enabled:
    │   - Create scheduler
    │   - Add jobs
    │   - Start scheduler
    │
    ▼
App State Setup
    │
    │ app.state.settings = ...
    │ app.state.get_db = ...
    │ app.state.entry_service = ...
    │ app.state.asset_service = ...
    │ app.state.user_service = ...
    │ app.state.youtube_service = ...
    │ app.state.growth_score_service = ...
    │ app.state.assistant_agent = ...
    │ app.state.scheduler = ...
    │
    ▼
Ready to Serve Requests
```

### Shutdown Sequence

```
Signal Received (SIGINT/SIGTERM)
    │
    ▼
Lifespan Cleanup
    │
    │ scheduler.shutdown(wait=False)
    │
    ▼
Cleanup Complete
    │
    │ Server exits
```

## Channel Selection Flow

### First-Time Login

```
User opens app
    │
    ▼
Check for saved channel
    │
    │ No channel found
    │
    ▼
Show channel selection dialog
    │
    │ User selects channel
    │
    ▼
POST /settings/channel
    │
    │ { channel_id: "..." }
    │
    ▼
Backend saves channel preference
    │
    │ Store in settings table
    │
    ▼
Load dashboard with channel context
    │
    │ Score chart + Timeline
```

### Subsequent Logins

```
User opens app
    │
    ▼
Check for saved channel
    │
    │ Channel found
    │
    ▼
GET /settings/channel
    │
    │ Return saved channel_id
    │
    ▼
Load dashboard with channel context
    │
    │ Score chart + Timeline
    │ (No prompt needed)
```

## State Synchronization

### Frontend State Hierarchy

```
App State
├── Server State (TanStack Query)
│   ├── Health status (cached, 60s stale)
│   ├── Entries (journal + content)
│   ├── Conversations + turns
│   └── YouTube feed + growth summary
└── Local State (useState)
    ├── activityItems[] (content, journal, insight, conversation)
    ├── draft (current entry being edited)
    └── filters + search query
```

### Backend State

```
FastAPI App State
├── settings (Configuration)
├── get_db (Database factory)
├── entry_service (Entry persistence)
├── asset_service (Asset storage + metadata)
├── user_service (Active user/channel state)
├── youtube_service (YouTube integration)
├── growth_score_service (Growth calculations)
├── assistant_agent (PydanticAI agent or None)
└── scheduler (Background jobs)
```

## Data Models

### Current Models

**ActivityItem (Frontend):**

```typescript
{
  id: string
  title: string
  summary: string
  date: string (ISO timestamp)
  category: "content" | "insight" | "journal" | "conversation"
  linkUrl?: string
  thumbnailUrl?: string
  videoId?: string
  videoType?: "short" | "live" | "video"
}
```

**Timeline Content Types:**

- **Content** (`content`): Synced from YouTube
- **Journal Entries** (`journal`): User-created entries
- **Insights** (`insight`): AI-generated insights (not yet available)
- **Conversations** (`conversation`): Loopie conversation summaries

**HealthResponse (Backend):**

```python
{
  "status": "healthy"
}
```

**Entry (Backend):**

```python
class Entry:
    id: str
    title: str
    summary: str  # markdown, may include /assets/{id}
    date: datetime
    category: Literal["content", "insight", "journal"]
    link_url: Optional[str]
    thumbnail_url: Optional[str]
    video_id: Optional[str]
```

**Conversation Turn (Backend):**

```python
class Turn:
    id: str
    role: Literal["user", "assistant"]
    text: str
    attachments: list[str]  # asset ids (request)
```

**Asset Payload (Backend):**

```json
{
  "id": "sha256...",
  "url": "/assets/{id}",
  "filename": "upload.png",
  "mimeType": "image/png",
  "sizeBytes": 12345,
  "width": 800,
  "height": 600,
  "markdown": "![upload](/assets/{id})"
}
```

### Future Models

**Channel Preference (Backend):**

```python
class ChannelPreference:
    id: UUID
    channel_id: str  # YouTube channel ID
    channel_name: str
    created_at: datetime
    updated_at: datetime
```

**YouTube Metrics:**

```python
class YoutubeMetrics:
    video_id: str
    title: str
    views: int
    watch_time_minutes: int
    avg_view_duration: float
    ctr: float
    published_at: datetime
    synced_at: datetime
```

**Growth Score:**

```python
class GrowthScore:
    calculated_at: datetime
    score: float
    ctr_factor: float
    retention_factor: float
    trend: str  # "up", "down", "stable"
```

## Error Handling Flow

### API Error

```
Request Fails
    │
    ▼
Axios Exception
    │
    │ Catch error
    │
    ▼
TanStack Query
    │
    │ status = "error"
    │ error = <Error object>
    │
    ▼
React Component
    │
    │ Display error UI
    │ HealthBadge shows "API offline"
    │
    ▼
User sees error message
```

### Database Error

```
Database Operation Fails
    │
    ▼
SQLite Exception
    │
    │ Catch in service layer
    │
    ▼
Log Error
    │
    │ logger.error("Database operation failed")
    │
    ▼
Return Error Response
    │
    │ HTTP 500 with error details
    │
    ▼
Frontend handles error
```

### Agent Conversation Flow (SSE Streaming)

```
User sends message to agent
    │
    │ POST /conversations/{id}/turns/stream
    │ Body: { "text": "How can I improve retention?", "attachments": ["asset_id"] }
    │
    ▼
FastAPI Backend (conversations.py)
    │
    │ 1. Validate conversation exists
    │ 2. Insert user turn into database
    │ 3. Load attachments (images + PDFs)
    │    - Images converted to data URLs
    │    - PDF text appended as context
    │ 4. Cancel any in-flight generation for this conversation
    │
    ▼
EventSourceResponse (SSE stream)
    │
    │ Opens Logfire trace for observability
    │ Creates async task for generation
    │
    ▼
PydanticAI Agent (app.state.assistant_agent)
    │
    │ async with agent.run_stream(user_text) as result:
    │     async for token in result.stream_text():
    │         yield SSE event: { "event": "token", "data": {"token": "..."} }
    │
    ▼
SSE Events Streamed to Client
    │
    │ event: token
    │ data: {"token": "To"}
    │
    │ event: token
    │ data: {"token": " improve"}
    │
    │ ... (continues token by token)
    │
    ▼
Generation Complete
    │
    │ Insert assistant turn into database
    │ Yield final event: { "event": "done", "data": {"turn_id": "...", "text": "..."} }
    │
    ▼
Client Receives Complete Response
    │
    │ Frontend updates UI with full assistant message
    │ Conversation history persisted for context
```

**Key Features:**

- Real-time streaming: Token-by-token responses via Server-Sent Events
- Conversation persistence: All turns stored in SQLite for context reconstruction
- Cancellation support: New messages automatically cancel in-flight generations
- Attachment support: Images + PDFs included in agent context
- Observability: Logfire traces capture generation timing and errors
- Simple API: REST endpoints for conversation management, SSE for streaming

### Agent-Based Insight Tracking Flow (Future)

```
User interacts with Agent
    │
    │ User asks: "Track if shorter intros improve retention"
    │
    ▼
Agent processes request
    │
    │ 1. Understand user intent
    │ 2. Create tracking action
    │ 3. Save action to background job queue
    │
    ▼
Agent saves background action
    │
    │ Store tracking configuration:
    │ - What to track (retention)
    │ - Condition (shorter intros)
    │ - Frequency (periodic check)
    │
    ▼
Background job runs (periodic)
    │
    │ 1. Fetch journal entries and performance data
    │ 2. Analyze patterns based on tracking config
    │ 3. Detect if pattern emerges
    │
    ▼
Pattern detected
    │
    │ Generate insight entry:
    │ "Shorter intros improved retention by 14%"
    │
    ▼
Insert insight into timeline
    │
    │ Category: "insight"
    │ Linked to agent interaction
    │
    ▼
Timeline updated
    │
    │ Insight appears automatically
    │ User sees pattern from agent tracking
```

**Future Features:**

- Agent-driven: User explicitly requests tracking through agent interaction
- Background actions: Agent can save actions to run automatically
- Pattern detection: Analyzes performance data based on agent-configured tracking
- Timeline integration: Insights appear alongside content and journal entries
- Journal stays simple: No automatic parsing of journal entries

## Future Data Flows

### Real-time Updates

```
Backend WebSocket Server
    │
    │ Send update event
    │
    ▼
Frontend WebSocket Client
    │
    │ Receive event
    │
    ▼
TanStack Query
    │
    │ Invalidate cache
    │ Refetch data
    │
    ▼
UI Updates
```

### Search and Filtering

```
User enters search query
    │
    ▼
api/entries.ts
    │
    │ GET /entries?q=search&category=journal
    │
    ▼
Backend Router
    │
    │ Query database
    │ SELECT * FROM entries WHERE ...
    │
    ▼
Return filtered results
    │
    ▼
Display in ActivityFeed
```

## Data Validation Flow

### Frontend Input Validation

```
User Input
    │
    ▼
Form Component
    │
    │ Validate:
    │ - Required fields
    │ - Date format
    │ - Length constraints
    │
    ▼
If Valid → Submit
If Invalid → Show errors
```

### Backend Request Validation

```
HTTP Request
    │
    ▼
Pydantic Model
    │
    │ Validate:
    │ - Field types
    │ - Required fields
    │ - Custom validators
    │
    ▼
If Valid → Process
If Invalid → 422 Response
```

## Summary

Data flows through Storyloop follow these patterns:

1. **User-initiated actions** → Frontend state → API calls → Backend services → Database
2. **Background jobs** → Scheduled triggers → Service methods → Database updates
3. **Real-time updates** → Future WebSocket events → Frontend state sync
4. **Error handling** → Caught at each layer → Logged → User feedback

The architecture maintains clear separation between:

- **Presentation** (React components)
- **State management** (TanStack Query, useState)
- **API communication** (Axios client)
- **Business logic** (FastAPI services)
- **Data persistence** (SQLite database)
