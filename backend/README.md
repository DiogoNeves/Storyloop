# Storyloop Backend

FastAPI boilerplate configured with APScheduler, SQLite utilities, and Logfire observability hooks.

## Local development

```bash
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The app exposes a root `/health` endpoint that returns `{ "status": "Storyloop API ready" }`. APScheduler starts automatically inside the FastAPI lifespan and currently runs placeholder jobs for data syncs and Growth Score recalculations.

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
- `YOUTUBE_CLIENT_ID` - OAuth client ID for YouTube authentication
- `YOUTUBE_CLIENT_SECRET` - OAuth client secret for YouTube authentication
- `YOUTUBE_REDIRECT_URI` - OAuth redirect URI (defaults to `http://localhost:8000/youtube/auth/callback`)
- `ENV`

Update `.env` in the repository root to override these settings locally.

### YouTube OAuth Setup

To enable YouTube OAuth linking:

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the YouTube Data API v3
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URIs:
   - For local development: `http://localhost:8000/youtube/auth/callback`
   - For production: your production callback URL
5. Set `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in your `.env` file
6. Optionally set `YOUTUBE_REDIRECT_URI` if using a non-default callback URL

The OAuth flow:
1. Frontend calls `GET /youtube/auth/start` to get an authorization URL
2. User is redirected to Google for authorization
3. Google redirects to `GET /youtube/auth/callback` with an authorization code
4. Backend exchanges the code for tokens and stores them
5. Backend redirects to the frontend with `?youtube_auth=success`
6. Frontend can check status via `GET /youtube/auth/status`
7. Tokens can be refreshed via `POST /youtube/auth/refresh`
