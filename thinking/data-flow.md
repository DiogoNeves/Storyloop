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
User clicks "New Entry"
    │
    ▼
ActivityFeed.tsx
    │
    │ onStartDraft()
    │
    ▼
App.tsx (DashboardShell)
    │
    │ setDraft({ title: "", summary: "", date: now })
    │
    ▼
Dialog Opens (NewEntryDialog)
    │
    │ User fills form
    │   - Title input
    │   - Summary textarea
    │   - Date/time picker
    │
    ▼
onDraftChange(draft)
    │
    │ setDraft(updatedDraft)
    │
    ▼
User clicks "Save"
    │
    ▼
onSubmitDraft()
    │
    │ handleSubmitDraft()
    │   - Generate UUID
    │   - Create ActivityItem
    │   - Add to activityItems array
    │   - Sort by date
    │
    ▼
State Update
    │
    │ setActivityItems(sortedItems)
    │ setDraft(null)
    │
    ▼
ActivityFeed Re-renders
    │
    │ New entry appears at top
    │ Dialog closes
    │
    ▼
[Future: API call to persist entry]
```

**Current State:** Entries stored in React state only (not persisted)

**Future Implementation:**
```
handleSubmitDraft()
    │
    │ mutation.mutate(draft)
    │
    ▼
api/entries.ts
    │
    │ POST /entries
    │ body: { title, summary, date }
    │
    ▼
Backend Router
    │
    │ Save to SQLite
    │
    ▼
Database
    │
    │ INSERT INTO entries (...)
    │
    ▼
Return saved entry
    │
    │ Update React state
    │ Optimistic update
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
    │ 1. Authenticate with YouTube API
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
    │ - YoutubeService
    │ - GrowthScoreService
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
    │ app.state.youtube_service = ...
    │ app.state.growth_score_service = ...
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

## State Synchronization

### Frontend State Hierarchy

```
App State
├── Server State (TanStack Query)
│   └── Health status (cached, 60s stale)
└── Local State (useState)
    ├── activityItems[] (journal entries)
    └── draft (current entry being edited)
```

### Backend State

```
FastAPI App State
├── settings (Configuration)
├── get_db (Database factory)
├── youtube_service (YouTube integration)
├── growth_score_service (Growth calculations)
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
  category: "video" | "insight" | "journal"
}
```

**HealthResponse (Backend):**
```python
{
  "status": "healthy"
}
```

### Future Models

**Entry (Backend):**
```python
class Entry:
    id: UUID
    title: str
    summary: str
    date: datetime
    category: str
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

