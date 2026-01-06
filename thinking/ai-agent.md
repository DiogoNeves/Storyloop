# Storyloop AI Agent Design

> **Implementation Status:** This document describes the comprehensive design vision for the Storyloop AI agent. The current implementation (v1) provides the foundational infrastructure:
> - ✅ SSE streaming conversations with PydanticAI
> - ✅ Conversation persistence in SQLite
> - ✅ Basic system prompt for YouTube creator assistance
> - 🔄 Future: Context awareness, data fluency (see sections below)

## Overview

The Storyloop AI agent is a creative partner for YouTube storytellers. It combines the creator's intent, the current screen state, and Storyloop's historical analytics to surface guidance that feels bespoke rather than generic. The experience should balance inspiration and rigor so every interaction offers a clear next step, an insight worth sharing, or a confidence boost grounded in data.

## Experience Pillars

1. **Always Accessible** – Lives alongside the product experience and is a single click or shortcut away.
2. **Context-Aware** – Speaks to what is on screen, who the creator is, and how their channel has behaved over time.
3. **Data Fluent** – Navigates Storyloop’s readonly APIs confidently, surfacing comparisons, anomalies, and patterns.
4. **Action-Forward** – Every response nudges toward an experiment, a habit, or a trackable signal.
5. **Proactively Insightful** – Remembers what matters to the creator and keeps watch in the background without extra prompting.

## Interface Blueprint

**Design reference:** [Agent/Chatbot Design](../design/with-chatbot.png) (placeholder)

- **Persistent entry point** – Floating button or collapsible sidebar visible across Storyloop.
- **Conversation canvas** – Vertical layout with message history, response typing indicator, and lightweight formatting for callouts.
- **Context capsule** – Compact panel that lists the current page, selected videos or entries, date ranges, and channel persona.
- **Suggested sparks** – Quick action chips that adapt to the current context (e.g., “Compare to last upload,” “Track this pattern”).
- **Assistive states** – Clear loading, retry, and privacy indicators to reinforce reliability.

## Context Awareness

When a creator asks a question, the agent receives structured context from the frontend so its replies feel specific.

```typescript
{
  currentPage: "dashboard" | "video-detail" | "loopie" | ...,
  visibleItems: Video[] | Entry[],
  selectedItem?: Video | Entry,
  filters: {
    dateRange?: { start: Date; end: Date };
    contentType?: string[];
  };
  userContext: {
    channelId: string;
    channelType: "gaming" | "education" | "lifestyle" | ...;
    accountStage: "early" | "growing" | "established";
  };
}
```

The agent references this capsule explicitly (“You’re looking at ‘Advanced Tutorial’ from last week…”) to reinforce trust.

## Data & Knowledge Foundations

### Readonly API Surface

- **Entries** – `/api/entries/*` for journals, production notes, and tagged content.
- **YouTube Data** – `/api/youtube/*` for video metrics, channel stats, and historical views.

### Exploration Patterns

- Query ranges ("Show me videos from the last 3 months with retention above 60%").
- Spot behavioral rhythms ("Which upload days drive the highest early views?").
- Compare video performance across time periods.

### Knowledge Curation

- **Specialist libraries** capturing best practices for thumbnails, titles, upload cadence, and retention.
- **Channel archetypes** (gaming, education, lifestyle, tutorial, etc.) with tailored heuristics.
- **Growth stages** (early, growing, established) to adapt tone and ambition.
- **Expert review loop** so recommendations stay aligned with current YouTube trends.

## Conversation Patterns

### Contextual Comparison

- **User**: "Why did this video outperform the previous one?"
- **Agent**: Highlights the current and prior videos, compares key metrics, and suggests what might have contributed to the difference.

### Exploratory Query

- **User**: "Show me uploads with retention above 70%."
- **Agent**: Returns the qualifying list and names timing patterns.

## Technical Architecture Overview

### Agent Service Layer

**Current Implementation:** `backend/app/services/agent.py`

- ✅ `build_agent()` - Creates and configures PydanticAI agent with OpenAI's gpt-5.1-chat-latest model
- ✅ Basic system prompt for YouTube creator assistance
- ✅ Optional initialization (returns None if OPENAI_API_KEY not set)
- ✅ Stored in `app.state.assistant_agent` for dependency injection

**Future Enhancements:**

- Ingests chat requests with bundled context (structured context capsule from frontend)
- Orchestrates readonly API queries (`/api/entries/*`, `/api/youtube/*`)
- Knowledge retrieval and specialist libraries
- Emits responses with natural language, suggested actions, and logged data access
- Context-aware responses using frontend-provided context capsule

### Agent Tools & Dependencies

- Tooling lives under `backend/app/services/agent_tools/` to keep the PydanticAI agent lean.
- `JournalRepository` and `YouTubeRepository` reuse the same services as FastAPI routes so the tools and HTTP endpoints stay in sync.
- Registered tools:
  - `load_journal_entries` (recent journal tone/context)
  - `list_recent_videos` (latest long-form uploads, optional shorts)
  - `get_video_details` (single video metadata)
  - `get_video_metrics` (structured placeholder until metrics sync ships)
- The agent builds `LoopieDeps` (user id + repositories) per request via `build_loopie_deps(app)` and passes them through `run_stream`.
- System prompt reminds Loopie to infer tone from chat + journals, favor tools over guesses, and note that persistent memory is coming later.

### Frontend Touchpoints

**Current Implementation:** API endpoints ready for frontend integration

- ✅ `POST /conversations` - Create conversations
- ✅ `GET /conversations/{id}/turns` - Retrieve conversation history
- ✅ `POST /conversations/{id}/turns/stream` - SSE streaming endpoint

**Future Module:** `frontend/src/components/AgentChat.tsx`

- Hosts the persistent interface and conversation state
- Gathers context from route metadata, selected entities, and filter state
- Manages optimistic UI for chat, suggested sparks, and tracking confirmations
- Coordinates with TanStack Query for agent endpoints and caching
- Sends structured context capsule with each message (see Context Awareness section)

### LLM Integration Pattern

- System prompt defines role, available data, guardrails, and tone.
- User prompt bundles the latest message, recent conversation summary, and context capsule.
- Responses are parsed JSON (text, suggested actions, follow-up queries, citations) for deterministic rendering.
- Long threads are summarized to respect token limits while preserving key decisions.

## Forward-Looking Concepts

The design leaves space for richer storytelling artifacts—pulse-style daily briefings, multi-channel comparisons, or voice-driven check-ins. These modules should feel like natural extensions of the core loop of question → insight → action, reusing the same context capsule and response contract.

## Measuring Delight

Success is defined by more than raw usage. Track repeat daily activations, opt-in rates for automated tracking, satisfaction gestures (thumbs up, saved replies), and qualitative feedback that creators feel “understood” and “supported.” The north star is whether creators describe the agent as a collaborator they rely on.
