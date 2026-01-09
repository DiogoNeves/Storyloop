# Storyloop Backend

FastAPI backend with SQLite persistence and Logfire observability.

## Local development

```bash
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

The app exposes a root `/health` endpoint that returns `{ "status": "Storyloop API ready" }`.

## Testing

```bash
uv run pytest
```

The pytest suite includes an async health-check test that exercises the ASGI app with `httpx.ASGITransport`.

## Configuration

Environment variables are loaded via `.env` and `python-dotenv`. Default values are defined in `app/config.py`:

- `DATABASE_URL` (`sqlite:///backend/.data/storyloop.db` by default)
- `LOGFIRE_API_KEY`
- `OPENAI_API_KEY`
- `YOUTUBE_API_KEY`
- `ENV`

Update `.env` in the repository root to override these settings locally.

## YouTube Demo Mode

Demo mode allows you to run Storyloop without YouTube API credentials or OAuth setup by using pre-recorded fixture data. This is useful for development, testing, and demonstrations.

### Overview

When demo mode is enabled, the application:

- Uses `DemoYoutubeService` instead of the real `YoutubeService`
- Loads YouTube API responses from JSON fixture files in `app/fixtures/youtube/`
- Returns a demo user with demo channel credentials (`UCDEMOCHANNEL`)
- Uses a separate demo database (`storyloop-demo.db`) to avoid polluting production data
- Bypasses OAuth flows (OAuth endpoints return errors in demo mode)

### Enabling Demo Mode

Set the `YOUTUBE_DEMO_MODE` environment variable to `true`:

```bash
YOUTUBE_DEMO_MODE=true
```

Optionally, specify a fixture scenario:

```bash
YOUTUBE_DEMO_MODE=true
YOUTUBE_DEMO_SCENARIO=baseline
```

If `YOUTUBE_DEMO_SCENARIO` is not set, it defaults to `"baseline"`.

### Fixture Structure

Fixtures are organized by scenario under `app/fixtures/youtube/<scenario>/`. Each scenario contains endpoint-specific JSON files that mirror YouTube Data API responses.

The fixture loader uses a smart matching algorithm:

1. **Parameter-specific fixtures**: Files named with parameter values (e.g., `id-UCDEMOCHANNEL__maxResults-1__part-snippet_contentDetails.json`)
2. **Default fixtures**: Fallback to `default.json` files when no parameter-specific match exists
3. **Handle/username fallback**: When looking up channels by handle or username, automatically falls back to ID-based fixtures using `UCDEMOCHANNEL`

Example fixture paths:
```
app/fixtures/youtube/baseline/
├── channels/
│   ├── list/
│   │   ├── default.json
│   │   ├── id-UCDEMOCHANNEL__maxResults-1__part-snippet_contentDetails.json
│   │   └── maxResults-1__mine-true__part-snippet_contentDetails.json
│   └── default.json
├── playlistItems/
│   └── list/
│       ├── default.json
│       └── maxResults-50__part-snippet_contentDetails__playlistId-UUDEMOCHANNEL.json
└── videos/
    └── list/
        ├── default.json
        └── id-DEMO_VIDEO_1_DEMO_VIDEO_2_DEMO_VIDEO_3__part-contentDetails_snippet_status.json
```

### How It Works

1. **FixtureLoader** (`app/services/youtube_demo.py`):
   - Loads JSON payloads from fixture files based on endpoint, operation, and parameters
   - Filters out authentication parameters (`key`, `access_token`, `oauth_token`)
   - Generates candidate file paths using parameter values
   - Falls back to `default.json` if no specific match is found

2. **DemoYoutubeService**:
   - Extends `YoutubeService` but overrides `_request_json()` to load fixtures
   - Returns `FakeYoutubeApiClient` instead of real API client
   - Always uses authenticated methods (requires `user_service` and `oauth_service`)

3. **DemoUserService**:
   - Wraps the real `UserService` and delegates most operations
   - `get_active_user()` returns a demo user with:
     - Channel ID: `UCDEMOCHANNEL`
     - Channel Title: "Storyloop Demo Channel"
     - Demo credentials that never expire

4. **DemoYoutubeOAuthService**:
   - Returns demo credentials that are always valid
   - `create_flow()` raises an error (OAuth flows not supported in demo mode)
   - `refresh_credentials()` is a no-op (credentials never expire)

### Demo User

When demo mode is active, `get_active_user()` returns:

- **ID**: `"active"`
- **Channel ID**: `UCDEMOCHANNEL`
- **Channel Title**: "Storyloop Demo Channel"
- **Channel URL**: `https://www.youtube.com/channel/UCDEMOCHANNEL`
- **Credentials**: Demo OAuth credentials (never expire)

If a real user with credentials exists in the database, that user is returned instead.

### Database Isolation

Demo mode automatically switches to a separate database:

- **Production database**: `backend/data/storyloop.db` (default)
- **Demo database**: `backend/data/storyloop-demo.db` (when `YOUTUBE_DEMO_MODE=true`)

This prevents demo data from polluting your production database. The demo database URL can be customized via `DEMO_DATABASE_URL`.

### Limitations

- **OAuth flows**: Not supported in demo mode. OAuth endpoints will return errors.
- **Real API calls**: All YouTube API requests are served from fixtures. No actual API calls are made.
- **Dynamic data**: Fixture data is static. It won't reflect real-time changes from YouTube.

### Creating New Fixtures

To add new fixtures:

1. Create a new scenario directory under `app/fixtures/youtube/` (e.g., `app/fixtures/youtube/my-scenario/`)
2. Add endpoint-specific JSON files following the existing structure
3. Use `YOUTUBE_DEMO_SCENARIO=my-scenario` to load your fixtures

Fixture file names are generated from request parameters:
- Parameters are sorted alphabetically
- Values are sanitized (special characters replaced with `-`)
- Format: `param1-value1__param2-value2.json`

Example: A request with `id=UCDEMOCHANNEL&maxResults=1&part=snippet,contentDetails` matches:
- `id-UCDEMOCHANNEL__maxResults-1__part-snippet_contentDetails.json`
- Falls back to `default.json` if not found

### Example Usage

```bash
# Enable demo mode with baseline scenario
export YOUTUBE_DEMO_MODE=true
export YOUTUBE_DEMO_SCENARIO=baseline

# Start the application
python scripts/dev.py
```

The application will log:
```
Using demo database: sqlite:///backend/data/storyloop-demo.db (demo mode prevents writes to production database)
Application configured for development environment with YouTube demo mode enabled (scenario=baseline)
```
