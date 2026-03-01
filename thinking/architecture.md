# Storyloop Architecture Overview

## System Architecture

Storyloop is a creator analytics journal that combines a FastAPI backend with a React frontend to help content creators track their growth metrics and journal their creative journey.

### Tech Stack

**Backend:**

- **FastAPI** - Modern async Python web framework
- **SQLite** - Local database for persistence
- **Logfire** - Observability and logging
- **Pydantic** - Settings and data validation
- **PydanticAI** - AI agent framework for conversational interactions
- **SSE-Starlette** - Server-Sent Events for streaming responses
- **Uvicorn** - ASGI server

**Frontend:**

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety
- **TanStack Query** - Server state management
- **Axios** - HTTP client
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library
- **Vitest** - Testing framework

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              React Frontend (Vite)                    │   │
│  │  - App.tsx (Main dashboard)                           │   │
│  │  - ActivityFeed (Timeline: content, journal)          │   │
│  │  - Channel Selection (First-time login)               │   │
│  │  - API Client (Axios)                                 │   │
│  │  - TanStack Query (Data fetching)                     │   │
│  └──────────────────┬───────────────────────────────────┘   │
└──────────────────────┼───────────────────────────────────────┘
                       │ HTTP (CORS)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              FastAPI Backend (Uvicorn)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Routers (/health, /entries, /assets, /conversations) │   │
│  │  Services (YouTube, Assets, Entries)                  │   │
│  │  Storage Layer (SQLite + assets on disk)              │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│         SQLite Database + Assets Directory                  │
│  (db_dir/storyloop.db + db_dir/assets/)                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Separation of Concerns**

   - Backend handles business logic, data persistence, and external API integration
   - Frontend focuses on UI rendering and user interaction
   - Services encapsulate domain logic (YouTube integration, agent conversations)

2. **Observability**

   - Logfire integration for production monitoring
   - Environment-based configuration
   - Health check endpoints for system status

3. **Developer Experience**

   - Single command to start both services (`python scripts/dev.py`)
   - Hot reload on both frontend and backend
   - Shared TypeScript types between layers (to be implemented)

4. **Scalability**
   - Async/await throughout for concurrent request handling

### Component Boundaries

**Backend Services:**

- `YoutubeService` - Handles YouTube API integration
- `EntryService` - Persists journal and content entries for the activity feed and agent tools
- `AssetService` - Stores uploads on disk using SHA-256 IDs, keeps metadata in SQLite, resizes images (max 2000px edge), and extracts PDF text for agent context
- `SmartEntryUpdateManager` - Coordinates smart journal background updates, SSE streaming, and hourly refresh scheduling
- `build_agent()` - Creates and configures PydanticAI agent for conversational interactions
- `build_smart_entry_agent()` - Creates the background agent used for smart journal updates
- Database abstraction through `SqliteConnectionFactory`

**Frontend Modules:**

- API layer (`src/api/`) - Centralized HTTP client and query definitions
- Asset uploads (`src/api/assets.ts`, `src/hooks/useAssetUpload.ts`) - Handles image/PDF uploads and inserts markdown or attachments
- Offline entry sync (`src/context/SyncContext`, `src/lib/sync`) - Queues journal entries in IndexedDB and syncs on reconnect
- Components (`src/components/`) - Reusable UI components
- Pages (`src/App.tsx`) - Main application view
- Markdown rendering (`src/components/chat/MarkdownMessage.tsx`) - Rewrites `/assets/` URLs to `API_BASE_URL` and renders asset previews

### Environment Configuration

Settings are managed through `backend/app/config.py` using Pydantic:

- Environment variables loaded from `.env` file
- Type-safe settings with validation
- Sensible defaults for development
- Production overrides for scheduler, API keys, CORS origins

### Development Workflow

1. Both servers started via `python scripts/dev.py`
2. Backend runs on `http://127.0.0.1:8000`
3. Frontend runs on `http://127.0.0.1:5173`
4. Frontend proxies API calls to backend
5. CORS middleware handles cross-origin requests

### User Experience Flow

**First-Time Login:**

1. User opens application
2. System checks for saved channel preference
3. If no channel found, prompt user to select YouTube channel to track
4. Save channel selection to backend
5. Load dashboard with timeline

**Subsequent Logins:**

1. User opens application
2. System loads saved channel preference automatically
3. Display dashboard with timeline for that channel

**Dashboard Layout:**

**Design:** [Main Screen Design](../design/main-screen.png)

- **Timeline Section:** Unified chronological feed showing:
  - Content items (videos, lives, shorts, posts, etc.)
  - Journal entries (simple user-created entries)

**Agent Integration:**

**Current Implementation (v1):**

- Users interact with an AI agent via SSE streaming conversations
- Agent is powered by PydanticAI with OpenAI's gpt-5.1-chat-latest model
- Agent is optional: model provider/key are configured in `Settings → General → Model settings`
- Conversations are persisted in SQLite with `conversations` and `turns` tables
- Streaming responses enable real-time token-by-token generation
- Agent endpoints return error message if agent unavailable (similar to YouTube OAuth handling)
- Basic system prompt configured for YouTube creator assistance
- Journal entries remain simple and user-focused
- Image/PDF attachments are included as data URLs or extracted text in agent context when available

**Smart Journal Updates:**

- Smart journal entries store a prompt (`prompt_body`) plus optional format guidance (`prompt_format`)
- Background updates run through `SmartEntryUpdateManager` on create/prompt edit and hourly via APScheduler
- Updates stream to the UI over SSE (`POST /entries/{id}/smart/stream`) while persisting results in SQLite
- Each smart entry tracks `last_smart_update_at` for refresh cadence and `updated_at` for ordering

**Future Enhancements:**

- See [AI Agent Design](ai-agent.md) for comprehensive design details and future capabilities
- Context-aware responses using structured context from frontend (current page, selected items, filters)
- Data-fluent agent that queries readonly APIs (`/api/entries/*`, `/api/youtube/*`)
- Suggested action chips and conversation patterns for exploratory queries
- **Design:** [Agent/Chatbot Design](../design/with-chatbot.png)

### Future Extensions

- Enhanced agent capabilities
  - **Design:** [Agent/Chatbot Design](../design/with-chatbot.png)
  - **Detailed Design:** [AI Agent Design](ai-agent.md)
- Context-aware agent responses using Storyloop's analytics data
- Video detail pages (per-video view with related notes)
  - **Design:** [Video Detail Design](../design/video-detail.png) (Future)
- Additional content platform integrations
- User authentication and multi-tenancy
- Real-time updates via WebSockets
