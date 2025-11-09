# Backend Structure

## Directory Organization

```
backend/
├── app/                    # Main application code
│   ├── __init__.py
│   ├── main.py            # Application entry point
│   ├── config.py          # Settings and configuration
│   ├── db.py              # Database connection utilities
│   ├── scheduler.py       # Background job configuration
│   ├── routers/           # HTTP endpoints
│   │   ├── __init__.py
│   │   └── health.py      # Health check endpoint
│   └── services/          # Business logic
│       ├── __init__.py
│       ├── youtube.py     # YouTube API integration
│       └── growth.py      # Growth score calculations
├── tests/                 # Test suite
├── pyproject.toml         # Python dependencies
└── pytest.ini            # Test configuration
```

## Core Modules

### 1. Application Entry (`main.py`)

The application entry point sets up:

- **FastAPI app** with title and version
- **Lifespan handler** for startup/shutdown logic
- **CORS middleware** for cross-origin requests
- **API router** for all endpoints
- **Logfire observability** (optional, if API key provided)

Key functions:

- `create_app()` - Builds the FastAPI application instance
- `build_lifespan()` - Manages scheduler lifecycle
- `configure_logfire()` - Sets up observability

**Dependencies Injected into App State:**

- `app.state.settings` - Application configuration
- `app.state.get_db` - Database connection factory
- `app.state.youtube_service` - YouTube API service
- `app.state.growth_score_service` - Growth score service
- `app.state.scheduler` - Background job scheduler (if enabled)

### 2. Configuration (`config.py`)

Centralized settings management using Pydantic:

**Settings Model:**

- `environment` - dev/production environment
- `database_url` - SQLite database path
- `logfire_api_key` - Optional observability token
- `openai_api_key` - Optional AI integration key
- `youtube_api_key` - Optional YouTube API key
- `cors_origins` - Allowed frontend origins
- `enable_scheduler` - Override scheduler auto-detection

**Features:**

- Environment variable loading from `.env`
- Type validation and defaults
- Computed properties (e.g., `scheduler_enabled`)
- Factory method `Settings.load()` for instantiation

### 3. Database Layer (`db.py`)

SQLite connection management:

**Key Utilities:**

- `create_connection_factory()` - Returns a callable that creates connections
- `_sqlite_path()` - Parses SQLite URL and ensures directory exists
- Row factory configured to return `sqlite3.Row` objects

**Usage Pattern:**

```python
get_db = create_connection_factory()
conn = get_db()
# Use connection
conn.close()
```

### 4. Scheduler (`scheduler.py`)

APScheduler configuration for recurring jobs:

**Configured Jobs:**

1. **Weekly YouTube Sync** - Sundays at 3:00 AM UTC

   - Calls `youtube_service.sync_latest_metrics()`
   - Syncs creator metrics from YouTube API

2. **Daily Growth Score** - Daily at 1:00 AM UTC

   - Calls `growth_score_service.recalculate_growth_score()`
   - Recalculates aggregate growth metrics

3. **Agent Background Actions** (Future) - Periodic (triggered by agent-saved actions)
   - Executes actions saved by agent interactions
   - Analyzes patterns based on agent-configured tracking
   - Generates and inserts insights into timeline

**Activation:**

- Enabled by default in production environment
- Disabled in development (can be overridden via `ENABLE_SCHEDULER`)
- Gracefully handles startup/shutdown

### 5. Services

#### YoutubeService (`services/youtube.py`)

**Current State:** Placeholder implementation

**Purpose:** Sync creator metrics from YouTube API

**Methods:**

- `sync_latest_metrics()` - Fetches and stores latest YouTube metrics

**Future Implementation:**

- Authenticate with YouTube Data API v3 using OAuth 2.0 for installed applications
  - See: [Google OAuth 2.0 for Installed Applications](https://googleapis.github.io/google-api-python-client/docs/oauth-installed.html)
  - Uses `google-auth-oauthlib` and `google-api-python-client` libraries
  - OAuth flow implemented in `scripts/example_script.py` as reference
  - Requires client credentials (client_id, client_secret) from Google Cloud Console
  - Supports both `run_local_server()` (recommended) and `run_console()` authentication flows
- Use saved channel preference to fetch channel-specific data
- Fetch video performance metrics for tracked channel
- Store CTR, view duration, retention curves
- Handle rate limiting and pagination

#### GrowthScoreService (`services/growth.py`)

**Current State:** Placeholder implementation

**Purpose:** Calculate Storyloop Growth Score. See [thinking/insights.md](insights.md) for the full scoring and insights logic.

**Methods:**

- `recalculate_growth_score()` - Updates growth score aggregates

**Future Implementation:**

- Calculate CTR × (Avg View Duration ÷ Video Length)
- Track trends over time
- Generate insights and recommendations
- Store calculated metrics in database

#### AgentService (Future: `services/agent.py`)

**Purpose:** Handle agent interactions and manage background actions for insight tracking

**Methods:**

- `process_user_query()` - Handle user interactions with agent
- `save_background_action()` - Store actions requested by agent to run in background
- `execute_background_action()` - Run saved actions (called by scheduler)
- `generate_insight_entry()` - Create insight entries for timeline based on tracking results

**Future Implementation:**

- Agent integration for user interactions
- Users can ask agent to track specific insights
- Agent can save actions to background job queue
- Background jobs execute tracking actions periodically
- Pattern detection based on agent-configured tracking
- Insights generated through agent interactions, not automatic parsing of journal entries
- Journal entries remain simple and user-focused

### 6. Routers

#### Health Router (`routers/health.py`)

**Endpoint:** `GET /health`

**Response:**

```json
{
  "status": "healthy"
}
```

**Purpose:** Monitor backend availability

**Integration:** Frontend uses this to show connection status badge

#### Channel Settings Router (Future: `routers/settings.py`)

**Endpoints:**

- `GET /settings/channel` - Retrieve saved channel preference
- `POST /settings/channel` - Save channel preference (first-time setup)
- `PUT /settings/channel` - Update channel preference

**Purpose:** Manage user's channel selection for YouTube tracking

**Integration:** Frontend uses this to check for saved channel on app load and prompt for selection if none exists

## Request Flow

1. **HTTP Request** arrives at FastAPI
2. **CORS Middleware** validates origin
3. **Router** matches path to handler
4. **Handler** executes business logic
5. **Service Layer** interacts with database/external APIs
6. **Response** serialized and returned

## Background Job Flow

1. **Scheduler Start** - During application lifespan startup
2. **Job Trigger** - At configured cron schedule
3. **Service Method** - Execute business logic
4. **Database Update** - Persist results
5. **Logging** - Record job completion/failure

## Testing Strategy

**Test Structure:**

- `tests/conftest.py` - Shared fixtures
- `tests/test_health.py` - Health endpoint tests
- Mirror `app/` structure for feature tests

**Test Tools:**

- `pytest` - Test runner
- `pytest-asyncio` - Async test support
- Database fixtures for isolated tests

## Environment Variables

Required in `.env`:

```bash
ENV=development
DATABASE_URL=sqlite:///backend/.data/storyloop.db
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

Optional:

```bash
LOGFIRE_API_KEY=your_logfire_token
OPENAI_API_KEY=your_openai_key
YOUTUBE_API_KEY=your_youtube_key
ENABLE_SCHEDULER=true  # Override auto-detection
```

## Development Commands

```bash
# Start backend only
make backend

# Run tests
make test-backend

# Run linting
uv run ruff check backend
uv run mypy backend
```
