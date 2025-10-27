# Frontend Structure

## Directory Organization

```
frontend/
├── src/
│   ├── api/              # API client and queries
│   │   ├── client.ts     # Axios instance
│   │   ├── health.ts     # Health check queries
│   │   └── entries.ts    # Entry queries (future)
│   ├── components/       # React components
│   │   ├── ActivityFeed.tsx      # Main journal feed
│   │   ├── NavBar.tsx            # Navigation header
│   │   ├── NewEntryDialog.tsx    # Entry creation form
│   │   └── ui/                   # shadcn components
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       └── textarea.tsx
│   ├── lib/              # Utilities
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

**Structure:**
- `App()` - Root component wrapping with QueryClientProvider
- `DashboardShell()` - Main dashboard layout
- `HealthBadge()` - Backend connection status indicator
- `ScorePlaceholder()` - Placeholder for growth score visualization

**State Management:**
- Local state for activity items and draft entries
- React Query for server state (health status)
- Memoized seed data for development

**Key Features:**
- Health status monitoring
- Activity feed with journal entries
- Entry creation with date/time selection
- Sortable chronological feed

### ActivityFeed Component

**Purpose:** Display and manage journal entries

**Props:**
- `items` - Array of activity items
- `draft` - Currently editing draft entry
- `onStartDraft()` - Initiate new entry
- `onDraftChange()` - Update draft state
- `onCancelDraft()` - Discard draft
- `onSubmitDraft()` - Save entry

**Features:**
- Chronological sorting (newest first)
- Category badges (video, insight, journal)
- Date/time formatting
- Empty state handling
- Draft entry UI

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

### Query Definitions (`api/health.ts`)

**Pattern:** Using `@lukemorales/query-key-factory`

**Structure:**
```typescript
healthQueries.status() - Returns query config for health check
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
```

**Access:**
```typescript
import.meta.env.VITE_API_BASE_URL
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

## Future Enhancements

**Planned:**
- Entry API integration
- Real-time updates via WebSockets
- Drag-and-drop entry ordering
- Entry search and filtering
- Rich text editor for journal entries
- Image attachments
- Entry categories and tags

