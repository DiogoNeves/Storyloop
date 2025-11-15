# Storyloop System Architecture Diagram

## Component Diagram

```mermaid
graph TB
    subgraph "Browser"
        UI[React UI]
        Query[TanStack Query]
        API_Client[Axios Client]
    end

    subgraph "Backend Server"
        FastAPI[FastAPI App]
        Router[Routers]
        Service[Services]
        DB_Factory[DB Factory]
        Scheduler[APScheduler]
    end

    subgraph "Background Jobs"
        YT_Job[YouTube Sync<br/>Sunday 3am]
        GS_Job[Growth Score<br/>Daily 1am]
    end

    subgraph "External Services"
        YT_API[YouTube API]
        Logfire[Logfire]
    end

    subgraph "Storage"
        SQLite[(SQLite Database)]
    end

    UI --> Query
    Query --> API_Client
    API_Client -->|HTTP REST| FastAPI
    FastAPI --> Router
    Router --> Service
    Service --> DB_Factory
    DB_Factory --> SQLite

    FastAPI --> Scheduler
    Scheduler --> YT_Job
    Scheduler --> GS_Job
    YT_Job --> Service
    GS_Job --> Service

    Service -.->|Future| YT_API
    FastAPI -.->|Optional| Logfire

    style UI fill:#61dafb
    style FastAPI fill:#009485
    style SQLite fill:#003B57
    style Scheduler fill:#FFB347
```

## Request Flow Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant UI as React UI
    participant Q as TanStack Query
    participant A as Axios Client
    participant B as FastAPI Backend
    participant S as Service Layer
    participant D as SQLite DB

    U->>UI: Interact with app
    UI->>Q: useQuery(...)
    Q->>A: Check cache / Fetch
    A->>B: HTTP Request
    B->>S: Process request
    S->>D: Query database
    D-->>S: Return data
    S-->>B: Service result
    B-->>A: HTTP Response
    A-->>Q: Update cache
    Q-->>UI: Re-render
    UI-->>U: Display update
```

## Background Job Sequence

```mermaid
sequenceDiagram
    participant APS as APScheduler
    participant YT as YouTubeService
    participant GS as GrowthScoreService
    participant DB as SQLite DB

    Note over APS: Cron trigger (Sun 3am)
    APS->>YT: sync_latest_metrics()
    YT->>DB: Store metrics
    DB-->>YT: Confirm

    Note over APS: Cron trigger (Daily 1am)
    APS->>GS: recalculate_growth_score()
    GS->>DB: Store scores
    DB-->>GS: Confirm
```

See [thinking/insights.md](insights.md) for the full scoring and insights logic that GrowthScoreService follows.

## Data Flow Overview

```mermaid
flowchart LR
    subgraph "Frontend Layer"
        A[User Input]
        B[Component State]
        C[API Queries]
    end

    subgraph "Network Layer"
        D[CORS Middleware]
        E[HTTP Protocol]
    end

    subgraph "Backend Layer"
        F[Router]
        G[Services]
        H[Database]
    end

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H

    H -.->|Background Jobs| G
    G -.->|Updates| F
    F -.->|Push Events| E
    E -.->|WebSocket| C
```

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Components │  │   React UI   │  │  Styling     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼──────────────┐
│         │    STATE LAYER   │                  │              │
│         │  ┌──────────────┐│                  │              │
│         │  │ Query Cache  ││                  │              │
│         │  └──────┬───────┘│                  │              │
│         └─────────┼────────┘                  │              │
└───────────────────┼───────────────────────────┼──────────────┘
                    │                           │
┌───────────────────┼───────────────────────────┼──────────────┐
│          COMMUNICATION LAYER                  │              │
│         ┌──────────────┐                     │              │
│         │ Axios Client │                      │              │
│         └──────┬───────┘                      │              │
└────────────────┼──────────────────────────────┼──────────────┘
                 │                              │
                 │ HTTP                         │
                 │                              │
┌────────────────┼──────────────────────────────┼──────────────┐
│         API LAYER                             │              │
│   ┌─────────────┐    ┌─────────────┐        │              │
│   │   Routers   │    │   Middleware│        │              │
│   └──────┬──────┘    └──────┬───────┘        │              │
└──────────┼──────────────────┼─────────────────┼──────────────┘
           │                  │                 │
┌──────────┼──────────────────┼─────────────────┼──────────────┐
│    BUSINESS LOGIC LAYER                      │              │
│   ┌─────────────┐    ┌─────────────┐        │              │
│   │  Services   │    │   Scheduler  │        │              │
│   └──────┬──────┘    └──────┬───────┘        │              │
└──────────┼──────────────────┼─────────────────┼──────────────┘
           │                  │                 │
┌──────────┼──────────────────┼─────────────────┼──────────────┐
│      DATA LAYER                              │              │
│    ┌─────────────┐                           │              │
│    │   SQLite    │                           │              │
│    └─────────────┘                           │              │
└───────────────────────────────────────────────┘              │
```

## Service Dependencies

```
FastAPI Application
│
├── Settings (config.py)
│   ├── Environment variables
│   ├── Database URL
│   ├── API keys
│   └── CORS origins
│
├── Database (db.py)
│   └── Connection factory
│
├── Scheduler (scheduler.py)
│   ├── YouTube sync job
│   └── Growth score job
│
├── Services
│   ├── YoutubeService
│   │   └── YouTube API integration
│   ├── GrowthScoreService
│   │   └── Score calculations
│   └── Agent Service (agent.py)
│       └── PydanticAI agent builder
│
├── Database Helpers (db_helpers/)
│   └── conversations.py
│       └── Conversation/turn persistence
│
└── Routers
    ├── Health endpoint
    └── Conversations endpoint (SSE streaming)
```

## User Experience Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    FIRST-TIME LOGIN                         │
├─────────────────────────────────────────────────────────────┤
│ 1. User opens application                                   │
│ 2. System checks for saved channel preference               │
│ 3. No channel found → Show channel selection dialog         │
│ 4. User selects YouTube channel                             │
│ 5. Save channel preference to backend                       │
│ 6. Load dashboard                                           │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    DASHBOARD LAYOUT                         │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────┐  │
│ │         TOP SECTION: Score & Chart                   │  │
│ │  - Growth Score display                               │  │
│ │  - Simple score chart visualization                   │  │
│ └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│ ┌───────────────────────────────────────────────────────┐  │
│ │         TIMELINE SECTION                              │  │
│ │  - Content (videos, lives, shorts, posts, etc.)       │  │
│ │  - Journal entries (simple user-created entries)     │  │
│ │  - Insights (AI-generated from agent interactions)    │  │
│ │  All displayed chronologically                         │  │
│ └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  SUBSEQUENT LOGINS                         │
├─────────────────────────────────────────────────────────────┤
│ 1. User opens application                                   │
│ 2. System automatically loads saved channel preference     │
│ 3. Display dashboard with score chart and timeline         │
│ 4. No prompt needed unless user changes settings            │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

```
┌─────────────────────────────────────────────┐
│           FRONTEND STACK                    │
├─────────────────────────────────────────────┤
│ React 18         │ TypeScript               │
│ Vite             │ TanStack Query           │
│ Axios            │ Tailwind CSS             │
│ shadcn/ui        │ Vitest                   │
└─────────────────────────────────────────────┘
                    │
                    │ HTTP/REST
                    │
┌─────────────────────────────────────────────┐
│           BACKEND STACK                      │
├─────────────────────────────────────────────┤
│ FastAPI          │ Python 3.11              │
│ APScheduler      │ SQLite                   │
│ Pydantic         │ Logfire                  │
│ Uvicorn          │ pytest                   │
└─────────────────────────────────────────────┘
```
