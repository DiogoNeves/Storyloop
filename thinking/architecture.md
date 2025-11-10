# Storyloop Architecture Overview

## System Architecture

Storyloop is a creator analytics journal that combines a FastAPI backend with a React frontend to help content creators track their growth metrics and journal their creative journey.

### Tech Stack

**Backend:**

- **FastAPI** - Modern async Python web framework
- **SQLite** - Local database for persistence
- **APScheduler** - Background job scheduling for recurring tasks
- **Logfire** - Observability and logging
- **Pydantic** - Settings and data validation
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
│  │  - ScorePlaceholder (Growth score & chart at top)     │   │
│  │  - ActivityFeed (Timeline: content, journal, insights)│   │
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
│  │  Routers (/health)                                    │   │
│  │  Services (YouTube, Growth Score)                     │   │
│  │  Database Layer (SQLite)                              │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     │                                        │
│  ┌──────────────────▼───────────────────────────────────┐   │
│  │         APScheduler (Background Jobs)                 │   │
│  │  - Weekly YouTube sync (Sun 3am)                      │   │
│  │  - Daily growth score recalculation (1am)            │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              SQLite Database                                │
│  (backend/.data/storyloop.db)                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Separation of Concerns**

   - Backend handles business logic, data persistence, and external API integration
   - Frontend focuses on UI rendering and user interaction
   - Services encapsulate domain logic (YouTube metrics, growth scoring)

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
   - Background jobs don't block request handling
   - Environment-based scheduler configuration

### Component Boundaries

**Backend Services:**

- `YoutubeService` - Handles YouTube API integration and metric syncing
- `GrowthScoreService` - Calculates and maintains growth score metrics. See [thinking/insights.md](insights.md) for the full scoring and insights logic.
- `AgentService` (Future) - Handles agent interactions and manages background actions for insight tracking
- Database abstraction through `SqliteConnectionFactory`

**Frontend Modules:**

- API layer (`src/api/`) - Centralized HTTP client and query definitions
- Components (`src/components/`) - Reusable UI components
- Pages (`src/App.tsx`) - Main application view

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
5. Load dashboard with score chart and timeline

**Subsequent Logins:**

1. User opens application
2. System loads saved channel preference automatically
3. Display dashboard with score chart and timeline for that channel

**Dashboard Layout:**

**Design:** [Main Screen Design](../design/main-screen.png)

- **Top Section:** Growth Score and simple score chart visualization
  - **Insights Card:** When relevant timely insights are available, an insights card will be displayed in the top header alongside the time series chart with the score. This card surfaces actionable insights derived from recent performance patterns (e.g., hook improvements, content length patterns, upload timing optimizations, conversion efficiency trends). See [Insights Card Design](../design/insights-card.png) and [Insights Full Design](../design/insights-full.png).
- **Timeline Section:** Unified chronological feed showing:
  - Content items (videos, lives, shorts, posts, etc.)
  - Journal entries (simple user-created entries, no automatic parsing)
  - Insights (AI-generated from agent interactions)

**Agent Integration:**

- Users interact with an AI agent to ask questions and request insight tracking
- Agent can save actions to run in the background
- Background jobs execute tracking actions periodically
- Insights are generated through agent interactions, not automatic parsing of journal entries
- Journal entries remain simple and user-focused
- See [AI Agent Design](ai-agent.md) for comprehensive design details

### Future Extensions

- Agent integration for user interactions and insight tracking
  - **Design:** [Agent/Chatbot Design](../design/with-chatbot.png) (Future)
  - **Detailed Design:** [AI Agent Design](ai-agent.md)
- Agent can save background actions to monitor patterns over time
- OpenAI integration for AI-powered agent interactions
- Video detail pages (per-video view with deeper insights and related notes)
  - **Design:** [Video Detail Design](../design/video-detail.png) (Future)
- Additional content platform integrations
- User authentication and multi-tenancy
- Real-time updates via WebSockets
- More sophisticated growth score algorithms
