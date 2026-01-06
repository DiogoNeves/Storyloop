# Frontend Structure

## Directory Organization

```
frontend/
├── src/
│   ├── api/              # API client and query helpers
│   │   ├── assets.ts     # Asset uploads + metadata
│   │   ├── client.ts     # Axios instance
│   │   ├── conversations.ts # Loopie conversations + turns
│   │   ├── entries.ts    # Activity/journal entries
│   │   ├── health.ts     # Health check queries
│   │   └── youtube.ts    # YouTube data endpoints
│   ├── assets/           # Local static images
│   ├── components/       # React components
│   │   ├── ActivityDraftCard.tsx # Entry editor + uploads
│   │   ├── ActivityFeed.tsx      # Main journal feed
│   │   ├── LoopiePanel.tsx       # Agent chat panel
│   │   ├── chat/                 # Chat rendering
│   │   │   ├── AssetAttachmentList.tsx
│   │   │   ├── AssetLinkCard.tsx
│   │   │   └── MarkdownMessage.tsx
│   │   └── ui/                   # shadcn components
│   ├── context/          # Shared state providers
│   │   ├── AgentConversationContext.tsx
│   │   └── SettingsProvider.tsx
│   ├── hooks/            # Feature hooks
│   │   ├── useAgentConversation.ts
│   │   ├── useAssetUpload.ts
│   │   ├── useEntryEditing.ts
│   │   └── useYouTubeFeed.ts
│   ├── lib/              # Utilities and types
│   │   ├── assets.ts     # Asset URL helpers
│   │   ├── types/        # Shared TS types
│   │   └── utils.ts      # cn() helper
│   ├── pages/            # Routed pages
│   │   ├── ConversationDetailPage.tsx
│   │   ├── JournalDetailPage.tsx
│   │   ├── LoopiePage.tsx
│   │   └── VideoDetailPage.tsx
│   ├── App.tsx           # App shell + routing
│   ├── main.tsx          # React entry point
│   └── index.css         # Global styles + theme
├── tests/                # Test files
├── public/               # Static assets
├── package.json          # Dependencies
├── vite.config.ts        # Vite configuration
└── tailwind.config.js    # Tailwind setup
```

## Core Application

### App.tsx - App Shell & Routing

**Design:** [Main Screen Design](../design/main-screen.png)

**Structure:**

- `App()` - Root component wrapping providers (QueryClient, Settings, AgentConversation, Router)
- `AppLayout()` - Main layout with NavBar, journal column, and Loopie panel
- Routes for journal, Loopie, conversations, and video details

**Layout:**

1. **Journal Column:** Activity feed with draft editor and timeline items
2. **Loopie Column (desktop):** Agent chat panel and conversation context
3. **Detail Pages:** Journal entry detail, conversation detail, video detail

**State Management:**

- React Query for server state (entries, conversations, YouTube feed)
- Local state for drafts, filters, and UI controls
- Memoized demo data when no server data is available

**Key Features:**

- Activity feed driven by persisted entries + YouTube content + Loopie conversations
- Journal entry creation and editing (title, summary, date)
- Image/PDF attachments inserted into markdown summaries via uploads
- Loopie chat panel with attachment support
- Conversation and detail routes for deeper inspection

### ActivityFeed Component

**Purpose:** Display and manage the timeline of content and journal entries.

**Props:**

- `items` - Array of activity items (content, journal entries)
- `draft` - Currently editing draft entry
- `onStartDraft()` - Initiate new entry
- `onDraftChange()` - Update draft state
- `onCancelDraft()` - Discard draft
- `onSubmitDraft()` - Save entry

**Timeline Content Types:**

- **Content** - Videos from YouTube sync
- **Journal Entries** - User-created entries (markdown summary supports `/assets/{id}` links)
- **Conversations** - Loopie chat threads surfaced in the feed

**Features:**

- Chronological sorting (newest first)
- Category badges and inline edit/delete
- Draft entry UI with attachment uploads
- Search filtering and YouTube link status

### ActivityDraftCard Component

**Purpose:** Edit or create a journal entry with optional image/PDF uploads.

**Features:**

- Drag/drop and paste uploads for images and PDFs
- Inserts markdown snippets (`![alt](/assets/{id})`, `[file](/assets/{id})`)
- Inline error handling for upload failures

### LoopiePanel Component

**Purpose:** Conversational agent UI with attachments and streaming responses.

**Features:**

- Attachments list with previews before sending
- Drag/drop and paste uploads in the composer
- Sends attachment IDs alongside the message to the backend

### Chat Rendering

**MarkdownMessage:**

- Rewrites `/assets/` URLs to `API_BASE_URL`
- Renders asset link cards for non-image attachments

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

### Query Definitions (`api/*`)

**Pattern:** Using `@lukemorales/query-key-factory`

**Structure:**

```typescript
healthQueries.status() - Health check
entriesQueries.all() - Entries list
conversationQueries.list() - Loopie conversations
youtubeQueries.feed() - YouTube video feed
```

**Query Options (from App.tsx):**

- `retry: 0` - Don't retry failed requests
- `staleTime: 60_000` - Consider data fresh for 1 minute

### Usage Pattern

```typescript
const { data, status, error } = useQuery(healthQueries.status());
```

Handles:

- Loading state (`status === "pending"`)
- Error state (`status === "error"`)
- Success state (`status === "success"`)

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

- Entries, conversations, YouTube feed
- Asset upload responses and metadata
- Cache management and invalidation

**Benefits:**

- Automatic refetching
- Cache invalidation
- Loading/error states
- Background updates

### Local State (React useState)

**Used For:**

- UI interactions (dialogs, drafts, filters)
- Temporary form data
- Client-side sorting and search

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
pnpm run dev
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
pnpm run build
```

**Output:**

- Optimized bundle in `dist/`
- Code splitting
- Asset optimization
- Tree shaking

**Preview:**

```bash
pnpm run preview
```

## Environment Variables

**Configuration:**

```bash
VITE_API_BASE_URL=http://localhost:8000
```

**Access:**

```typescript
import.meta.env.VITE_API_BASE_URL;
```

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

## Future Enhancements

**Planned:**

- Channel selection UI and persistence
- Real-time updates via WebSockets
- Drag-and-drop entry ordering
- Advanced search and filtering
- Rich text editor for journal entries
- Entry categories and tags
- Agent integration
  - Users can interact with the AI agent for analytics questions
  - **Design:** [Agent/Chatbot Design](../design/with-chatbot.png)
- Video detail pages (per-video view with analytics and related notes)
  - **Design:** [Video Detail Design](../design/video-detail.png)
