# Frontend Structure

## Directory Organization

```
frontend/
├── src/
│   ├── api/              # API client and queries
│   │   ├── client.ts     # Axios instance
│   │   ├── health.ts     # Health check queries
│   │   ├── entries.ts    # Entry queries
│   │   └── conversations.ts  # Agent conversation API (SSE streaming)
│   ├── components/       # React components
│   │   ├── ActivityFeed.tsx      # Main journal feed
│   │   ├── NavBar.tsx            # Navigation header
│   │   ├── NewEntryDialog.tsx    # Entry creation form
│   │   ├── AgentPanel.tsx        # AI agent chat interface
│   │   └── ui/                   # shadcn components
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       └── textarea.tsx
│   ├── hooks/            # Custom React hooks
│   │   ├── useAgentConversation.ts  # Real agent with SSE streaming
│   │   ├── useAgentDemo.ts          # Demo mode (fake responses)
│   │   ├── useEntryEditing.ts       # Entry management
│   │   ├── useYouTubeFeed.ts        # YouTube data
│   │   └── index.ts                 # Hook exports
│   ├── lib/              # Utilities
│   │   ├── types/        # TypeScript types
│   │   │   ├── agent.ts  # Agent conversation types
│   │   │   └── entries.ts # Entry types
│   │   └── utils.ts      # cn() helper
│   ├── App.tsx           # Main application
│   ├── main.tsx          # React entry point
│   └── index.css         # Global styles + theme
├── tests/                # Test files
├── public/               # Static assets
├── package.json          # Dependencies
├── vite.config.ts        # Vite configuration
└── tailwind.config.js    # Tailwind setup
```

## Core Application

### App.tsx - Main Dashboard

**Design:** [Main Screen Design](../design/main-screen.png)

**Structure:**

- `App()` - Root component wrapping with QueryClientProvider
- `DashboardShell()` - Main dashboard layout
- `HealthBadge()` - Backend connection status indicator
- `ScorePlaceholder()` - Growth score and simple score chart displayed at the top

**Layout:**

1. **Top Section:** Score and simple score chart (as is)
2. **Timeline Section:** Activity feed displaying chronological entries

**State Management:**

- Local state for activity items and draft entries
- React Query for server state (health status, channel configuration)
- Memoized seed data for development

**Key Features:**

- Health status monitoring
- Growth score visualization at top
- Timeline feed below score with:
  - Content items (videos, lives, shorts, posts, etc.)
  - Journal entries (from the user)
  - Insights (from AI, not available yet)
- Entry creation with date/time selection
- Sortable chronological feed
- Channel selection on first login (to be implemented)

### ActivityFeed Component

**Purpose:** Display and manage the timeline of content, journal entries, and insights. See [thinking/insights.md](insights.md) for the full scoring and insights logic that powers these summaries.

**Props:**

- `items` - Array of activity items (content, journal entries, insights)
- `draft` - Currently editing draft entry
- `onStartDraft()` - Initiate new entry
- `onDraftChange()` - Update draft state
- `onCancelDraft()` - Discard draft
- `onSubmitDraft()` - Save entry

**Timeline Content Types:**

- **Content** - Videos, lives, shorts, posts, etc. (synced from YouTube/other platforms)
- **Journal Entries** - Simple user-created entries capturing creative decisions and reflections (no automatic parsing or insight extraction)
- **Insights** - AI-generated insights from agent interactions. Users can ask the agent to track specific insights, and the agent can save background actions to monitor patterns over time (not available yet)

**Agent Integration:**

- Users interact with an AI agent to request insight tracking
- Agent can save actions to run in the background
- Insights are generated through agent interactions, not automatic parsing of journal entries
- Journal entries remain simple and user-focused

**Features:**

- Chronological sorting (newest first)
- Category badges (video, insight, journal)
- Date/time formatting
- Empty state handling
- Draft entry UI
- Unified timeline view showing all activity types together

### NavBar Component

**Purpose:** Application navigation header

**Features:**

- Branding with Storyloop logo
- Navigation links (Dashboard, Library, Settings)
- Responsive design

## API Layer

### Client (`api/client.ts`)

**Axios Configuration:**

- Base URL: `http://localhost:8000` (configurable via `VITE_API_BASE_URL`)
- Timeout: 10 seconds
- JSON content type
- Environment variable support

### Query Definitions

**Pattern:** Using `@lukemorales/query-key-factory`

**Structure:**

```typescript
// Health checks
healthQueries.status() - Returns query config for health check

// Conversations (Agent)
conversationsQueries.turns(conversationId) - Returns conversation history
```

**Query Options (from App.tsx):**

- `retry: 0` - Don't retry failed requests
- `staleTime: 60_000` - Consider data fresh for 1 minute

### Conversations API (`api/conversations.ts`)

**SSE Streaming Implementation:**

- `createConversation()` - Create new conversation
- `fetchConversationTurns()` - Get conversation history
- `streamTurn()` - Stream assistant response via SSE
  - Uses fetch API (not EventSource) for POST with streaming
  - Real-time token-by-token updates
  - Handles `token`, `done`, and `error` events
  - Abort signal support for cancellation

**Types:**

- `ConversationOut` - Conversation metadata
- `TurnOut` - Message in conversation
- `TurnInput` - User message input
- `SSEEvent` - Streaming event types

### Usage Pattern

```typescript
const { data, status, error } = useQuery(healthQueries.status());
```

Handles:

- Loading state (`status === "pending"`)
- Error state (`status === "error"`)
- Success state (`status === "success"`)

**Agent Streaming:**

```typescript
const cleanup = streamTurn({
  conversationId,
  text: "user message",
  onToken: (token) => console.log(token),
  onDone: (turnId, fullText) => console.log("Complete"),
  onError: (message) => console.error(message),
});
```

## UI Components (shadcn/ui)

**Installed Components:**

- `Badge` - Status indicators and labels
- `Button` - Actions and interactions
- `Card` - Content containers with header/body
- `Dialog` - Modal overlays
- `Input` - Text input fields
- `Label` - Form labels
- `Textarea` - Multi-line text input

**Styling Approach:**

- Tailwind CSS utilities
- shadcn design tokens from `index.css`
- CSS variables for theming
- Responsive classes

## Styling System

### Theme (`index.css`)

**Design Tokens:**

- HSL color system for primary, secondary, accent, destructive
- Background and foreground colors
- Muted variants for subtle elements
- Border and input styling
- Animation utilities

**Default Palette:**

- Primary: Blue tones
- Accent: Subtle grays
- Destructive: Red tones
- Secondary: Muted contrast

### Tailwind Configuration

**Extends:**

- shadcn UI defaults
- Custom animation utilities
- Container queries

**Theme Customization:**
Update CSS variables in `index.css`:

```css
--primary: 222.2 84% 4.9%;
--accent: 210 40% 96.1%;
```

## State Management Patterns

### Server State (TanStack Query)

**Used For:**

- Health check status
- API data fetching
- Cache management

**Benefits:**

- Automatic refetching
- Cache invalidation
- Loading/error states
- Background updates

### Local State (React useState)

**Used For:**

- UI interactions (dialogs, drafts)
- Temporary form data
- Client-side sorting

**Benefits:**

- Fast, no network calls
- Simple for ephemeral data
- Immediate updates

## Component Composition

**Pattern:** Atomic Design

1. **Atoms** - UI primitives (buttons, inputs)
2. **Molecules** - Form groups, entry cards
3. **Organisms** - ActivityFeed, complete forms
4. **Templates** - DashboardShell layout
5. **Pages** - App.tsx composition

## Testing Strategy

**Test Setup:**

- Vitest as test runner
- Testing Library for component tests
- Jest DOM matchers

**Test Files:**

- `tests/App.test.tsx` - Main app tests
- `tests/setup.ts` - Test configuration

**Run Tests:**

```bash
make test-frontend     # Run once
make test-frontend -- --watch  # Watch mode
```

## Development Workflow

**Start Dev Server:**

```bash
npm run dev
# or
python scripts/dev.py  # Starts both frontend and backend
```

**Hot Reload:**

- Vite watches for file changes
- Instant updates without full page reload
- HMR preserves component state

**Linting:**

```bash
make lint-frontend
```

## Build & Deployment

**Production Build:**

```bash
npm run build
```

**Output:**

- Optimized bundle in `dist/`
- Code splitting
- Asset optimization
- Tree shaking

**Preview:**

```bash
npm run preview
```

## Environment Variables

**Configuration:**

```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_AGENT_DEMO_MODE=false  # Set to "true" for fake responses (no backend needed)
```

**Access:**

```typescript
import.meta.env.VITE_API_BASE_URL;
import.meta.env.VITE_AGENT_DEMO_MODE;
```

**Agent Mode:**
- `VITE_AGENT_DEMO_MODE=false` (default) - Uses real backend with SSE streaming
- `VITE_AGENT_DEMO_MODE=true` - Uses fake responses for development without backend

## TypeScript Configuration

**Strict Mode:**

- Enabled for type safety
- Path aliases (`@/` → `src/`)
- Separate configs for app and node

**Path Aliases:**

- `@/components` → `src/components`
- `@/api` → `src/api`
- `@/lib` → `src/lib`

## Channel Selection Flow

**First-Time Login:**

- User is prompted to select which YouTube channel to track
- Channel selection is saved to user preferences/database
- Channel information is stored and used for all subsequent syncs

**Subsequent Logins:**

- Saved channel is automatically loaded
- No prompt needed unless user explicitly changes channel settings
- Channel preference persists across sessions

**Implementation Notes:**

- Channel selection will be stored in backend (user preferences/settings table)
- Frontend will check for saved channel on app load
- If no channel exists, show channel selection dialog/modal
- Channel ID/identifier used for YouTube API syncs

## Agent Integration ✅

**Current Implementation:**

The AI agent ("Loopie") is fully integrated with real-time streaming capabilities:

**Components:**
- `AgentPanel.tsx` - Main chat interface with message bubbles, composer, and streaming indicators
- `useAgentConversation.ts` - Hook for real agent with SSE streaming
- `useAgentDemo.ts` - Hook for demo mode (fake responses)
- `conversations.ts` - API layer with SSE streaming support

**Features:**
- Real-time token-by-token streaming
- Conversation persistence across sessions
- Demo mode for development without backend
- Error handling and graceful degradation
- Clean conversation reset
- Optimistic UI updates

**Usage:**
```typescript
// In your app
import { AgentPanel } from "@/components/AgentPanel";

// Renders full agent interface
<AgentPanel />
```

**Configuration:**
- Set `VITE_AGENT_DEMO_MODE=true` for demo mode
- Defaults to real mode (requires backend with OPENAI_API_KEY)

**Design:** [Agent/Chatbot Design](../design/with-chatbot.png)

## Future Enhancements

**Planned:**

- Channel selection UI and persistence
- Entry API integration
- Real-time updates via WebSockets
- Drag-and-drop entry ordering
- Entry search and filtering
- Rich text editor for journal entries
- Image attachments
- Entry categories and tags
- **Agent enhancements:**
  - Context awareness (current page, selected items, filters)
  - Data fluency (query growth metrics, entries, YouTube data)
  - Proactive insights and tracking
  - Suggested action chips
  - Floating button or sidebar positioning
- Video detail pages (per-video view with deeper insights and related notes)
  - Most insights will be AI-inferred through agent interactions
  - Users can add notes, but insights are primarily agent-generated
  - **Design:** [Video Detail Design](../design/video-detail.png) (Future)
