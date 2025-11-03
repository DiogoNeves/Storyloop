# Storyloop Backend

FastAPI boilerplate configured with APScheduler, SQLite utilities, and Logfire observability hooks.

## Local development

```bash
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Running `uv sync` creates a project-local virtual environment under `backend/.venv` and
installs the dependencies listed in `pyproject.toml` and `uv.lock`, matching the
configuration used in CI.

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
- `ENV`

Update `.env` in the repository root to override these settings locally.
