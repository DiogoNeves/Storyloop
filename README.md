# Storyloop

Storyloop is a creator analytics journal — a tool that helps you understand your own creative process instead of chasing someone else’s algorithm.

Most analytics platforms flood you with charts and numbers, or push you toward generic “best practices.” Storyloop flips that around. It starts with your goals, written in natural language — “I want to improve audience retention by making intros shorter” — and quietly tracks how your creative experiments perform.

Over time, it connects your notes and hypotheses to real outcomes, revealing what genuinely works for you.

Built for creators who want control without complexity, Storyloop turns your channel’s data into a personal growth story. It’s not just analytics — it’s your creative journal, feedback loop, and growth companion.

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

## ChatKit Integration

Storyloop includes OpenAI ChatKit integration for an AI assistant panel. The assistant appears in a right-hand sidebar on the main dashboard.

### Setup

1. **Environment Variable**: Ensure `OPENAI_API_KEY` is set in your `.env` file.

2. **Workflow ID** (optional): By default, ChatKit uses a demo workflow placeholder (`demo-workflow-placeholder`). To use a real workflow:
   - Create a workflow in OpenAI's Agent Builder
   - Set `CHATKIT_WORKFLOW_ID` in your `.env` file to your workflow ID

3. **Backend Endpoints**:
   - `POST /chatkit/session` - Creates a ChatKit session and returns a client secret
   - `POST /chatkit/tools/youtube_get_metrics` - Placeholder tool endpoint for YouTube metrics (returns mock data)

### Frontend Integration

The ChatKit panel is automatically included in the main dashboard layout. It:
- Fetches a session token from the backend on mount
- Handles token refresh automatically
- Displays loading and error states gracefully
- Is hidden on smaller screens (mobile) and visible on desktop (`lg:` breakpoint)

The panel uses the `@openai/chatkit-react` package and loads the ChatKit script from OpenAI's CDN.

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
