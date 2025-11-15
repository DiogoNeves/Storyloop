# Storyloop

Storyloop is a creator analytics journal built for people taking their first real swing at YouTube. When you’re new, every dashboard screams for attention but none of them tell you what to actually do next.

Most analytics platforms flood you with charts and numbers, or push you toward generic “best practices.” Storyloop flips that around. It starts with your user-driven goals — “I want to land my first 1,000 subscribers by tightening my intros” — and quietly tracks how your creative experiments perform.

Over time, it connects those goals and hypotheses to real outcomes so you can see direction and momentum instead of staring at static graphs.

Built for new creators who want guidance without giving up control, Storyloop turns your channel’s data into a personal growth story. It’s not just analytics — it’s the roadmap that keeps you focused on what to make next.

## Prerequisites

- Python 3.11 (managed via [`uv`](https://docs.astral.sh/uv/))
- Node.js 18+
- npm 9+

## Quick start

1. Clone the repository and install the language runtimes listed above.
2. Copy the environment template and adjust values as needed:

   ```bash
   cp .env.example .env
   ```

   Update `CORS_ORIGINS` if you host the frontend on a different origin.

3. Install backend dependencies (creates a local virtual environment automatically):

   ```bash
   cd backend
   uv sync
   ```

4. Install frontend dependencies:

   ```bash
   cd ../frontend
   npm install
   ```

5. Launch both servers from the repository root:

   ```bash
   python scripts/dev.py
   ```

   The script runs the FastAPI app on `http://127.0.0.1:8000` and the Vite dev server on `http://127.0.0.1:5173`.

6. Visit `http://127.0.0.1:5173` to confirm the UI renders and reports backend health status.

## YouTube OAuth setup

Storyloop now supports authenticating against the YouTube Data API via OAuth. Configure the following environment variables (see
`.env.example` for placeholders):

- `YOUTUBE_CLIENT_ID` – the Google Cloud OAuth client for a "Web application".
- `YOUTUBE_CLIENT_SECRET` – the matching secret for the client above.
- `YOUTUBE_REDIRECT_URI` – must match the redirect registered with Google (default:
  `http://localhost:5173/auth/callback`).

The backend creates a `users` table on startup to store the active creator's channel metadata and OAuth credentials. Columns
include the primary key (`id`), serialized credential JSON (`credentials_json` and `credentials_updated_at`), saved channel
details (`channel_id`, `channel_title`, `channel_url`, `channel_thumbnail_url`, `channel_updated_at`), and the most recent
OAuth state token (`oauth_state`, `oauth_state_created_at`).

### Demo Mode

For development and testing without YouTube API credentials, enable demo mode by setting `YOUTUBE_DEMO_MODE=true`. Demo mode uses pre-recorded fixture data and a separate demo database. See [backend/README.md](backend/README.md#youtube-demo-mode) for detailed documentation.

## Project layout

```
Storyloop/
├── backend/          # FastAPI application, APScheduler, pytest config
├── frontend/         # Vite + React + Tailwind/Shadcn UI scaffold with Vitest
├── scripts/          # Helper utilities (dev runner, seed data)
├── design/           # Product sketches and references
├── Makefile          # Convenience tasks (dev, lint, tests)
├── .env.example      # Environment variable template
└── PLAN.md           # Implementation blueprint
```

## Useful commands

- `python scripts/dev.py` – start backend (uvicorn) and frontend (Vite) together.
- `make test-backend` – run the FastAPI pytest suite.
- `make test-frontend` – execute Vitest in run-once mode.
- `make lint-frontend` – lint the React project with ESLint flat config.
- `make seed` – populate the local SQLite database with demo YouTube metrics.

## Theme customization

- The frontend uses shadcn UI tokens defined in `frontend/src/index.css` inside an `@layer base` block.
- To change the palette, pick new HSL values from the shadcn Colors catalog and replace the `--primary`, `--accent`, `--secondary`, and related variables. See [shadcn Colors](https://ui.shadcn.com/colors) for ready-to-use values.
- After editing, run `npm run lint` and reload the Vite dev server to confirm the updated theme renders as expected.

## Testing & quality gates

- Backend tests live under `backend/tests/` and rely on `uv run pytest` for isolation.
- Frontend tests use Vitest + Testing Library; see `frontend/tests/` for examples.
- Ruff, mypy, and additional tooling can be enabled later via `uv add --dev` as the surface area grows.

## Next steps

The PLAN outlines the roadmap toward ingesting YouTube data, calculating the Storyloop Growth Score, and integrating a journaling workflow. See [thinking/insights.md](thinking/insights.md) for the full scoring and insights logic. With this boilerplate in place you can begin implementing those features immediately.
