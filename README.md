# Storyloop

Storyloop is a creator guidance journal built for people taking their first real swing at YouTube. When you’re trying to go from zero to your first 100k subscribers or views, every dashboard screams for attention but none of them tell you what to actually do next.

Most analytics platforms flood you with charts and numbers, or push you toward generic “best practices.” Storyloop flips that around. It starts with your user-driven goals — “I want to unlock my first 1,000 subscribers by tightening my intros” — and quietly tracks how your creative experiments perform.

Over time, it connects those goals and hypotheses to real outcomes so you can see direction and momentum instead of staring at static graphs.

Built for new creators who want guidance without giving up control, Storyloop turns your channel’s data into a personal growth story. It’s not just analytics — it’s a direction-driven roadmap that keeps you focused on what to make next.

## Prerequisites

- Python 3.11 (managed via [`uv`](https://docs.astral.sh/uv/))
- Node.js 18+
- pnpm 10+

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
   pnpm install
   ```

5. Launch both servers from the repository root:

   ```bash
   python scripts/dev.py
   ```

   The script runs the FastAPI app on `http://127.0.0.1:8000` and the Vite dev server on `http://127.0.0.1:5173`.

6. Visit `http://127.0.0.1:5173` to confirm the UI renders and reports backend health status.

## AI Agent Setup

Storyloop includes a conversational AI agent powered by PydanticAI and OpenAI. The agent is optional and will be disabled if the API key is not configured (similar to YouTube OAuth).

**Current Implementation (v1):**

- ✅ SSE streaming conversations with real-time token-by-token responses
- ✅ Conversation persistence in SQLite
- ✅ Basic system prompt for YouTube creator assistance
- ✅ Agent tools for journal context and Today checklist achievement tracking
- ✅ Extensible architecture ready for future enhancements

**Future Enhancements:**

- See [thinking/ai-agent.md](thinking/ai-agent.md) for comprehensive design vision
- Context-aware responses using structured context from frontend
- Data-fluent agent that queries readonly APIs for analytics insights
- Insight tracking with background monitoring and pattern detection

**Environment Variable:**

- `OPENAI_API_KEY` – Your OpenAI API key (optional, agent disabled if not set)

When configured, the agent is initialized at application startup and provides streaming conversational responses via Server-Sent Events (SSE). Conversations are persisted in SQLite with separate `conversations` and `turns` tables. If the API key is not set, the app will start successfully but agent endpoints will return an error message indicating the agent is unavailable.

**API Endpoints:**

- `POST /conversations` – Create a new conversation
- `GET /conversations/{id}/turns` – List all turns for a conversation
- `POST /conversations/{id}/turns/stream` – Stream assistant response (SSE, returns error if agent unavailable)

See [thinking/backend-structure.md](thinking/backend-structure.md#conversations-router-routersconversationspy) for detailed API documentation.

## YouTube OAuth setup

Storyloop now supports authenticating against the YouTube Data API via OAuth. Configure the following environment variables (see
`.env.example` for placeholders):

- `YOUTUBE_CLIENT_ID` – the Google Cloud OAuth client for a "Web application".
- `YOUTUBE_CLIENT_SECRET` – the matching secret for the client above.
- `YOUTUBE_REDIRECT_URI` – must match the redirect registered with Google (default:
  `http://localhost:5173/auth/callback`).

The backend creates a `users` table on startup to store the active creator's channel metadata and OAuth credentials. Columns
include the primary key (`id`), serialized credential JSON (`credentials_json` and `credentials_updated_at`), saved channel
details (`channel_id`, `channel_title`, `channel_url`, `channel_thumbnail_url`, `channel_updated_at`), the most recent
OAuth state token (`oauth_state`, `oauth_state_created_at`), and any credential error that requires relinking
(`credentials_error`).

### Demo Mode

For development and testing without YouTube API credentials, enable demo mode by setting `YOUTUBE_DEMO_MODE=true`. Demo mode uses pre-recorded fixture data and a separate demo database. See [backend/README.md](backend/README.md#youtube-demo-mode) for detailed documentation.

## Project layout

```
Storyloop/
├── backend/          # FastAPI application, pytest config
├── frontend/         # Vite + React + Tailwind/Shadcn UI scaffold with Vitest
├── scripts/          # Helper utilities (dev runner, seed data)
├── design/           # Product sketches and references
├── Makefile          # Convenience tasks (dev, lint, tests)
├── .env.example      # Environment variable template
└── PLAN.md           # Implementation blueprint
```

## Remote Access / Tailscale Setup (Optional)

The frontend uses `/api` as the base path for all API requests. In development, Vite proxies `/api/*` to the backend automatically. For production or remote access, use a reverse proxy (Caddy, nginx, etc.) to route requests.

**Recommended: Single Reverse Proxy (Caddy example)**

```
your-domain.ts.net {
  handle /api/* {
    uri strip_prefix /api
    reverse_proxy localhost:8000
  }
  handle {
    root * /path/to/frontend/dist
    file_server
    try_files {path} /index.html
  }
}
```

This serves the frontend and proxies `/api/*` to the backend on a single port—no CORS configuration needed.

**Alternative: Build-time Configuration**

If you can't use a reverse proxy, set `VITE_API_BASE_URL` at build time:

```bash
VITE_API_BASE_URL=https://api.example.com pnpm build
```

This embeds the full backend URL into the frontend bundle.

## Useful commands

- `make dev` – start backend and frontend in development mode (hot reload).
- `make prod` – build frontend and start both servers in production mode (offline PWA support).
- `make build` – build the frontend for production.
- `make test-backend` – run the FastAPI pytest suite.
- `make test-frontend` – execute Vitest in run-once mode.
- `make lint` – run backend + frontend linting checks.
- `make lint-frontend` – lint the React project with ESLint flat config.
- `make seed` – populate the local SQLite database with demo YouTube metrics.

## Theme customization

- The frontend uses shadcn UI tokens defined in `frontend/src/index.css` inside an `@layer base` block.
- To change the palette, pick new HSL values from the shadcn Colors catalog and replace the `--primary`, `--accent`, `--secondary`, and related variables. See [shadcn Colors](https://ui.shadcn.com/colors) for ready-to-use values.
- After editing, run `pnpm run lint` and reload the Vite dev server to confirm the updated theme renders as expected.

## Testing & quality gates

- Backend tests live under `backend/tests/` and rely on `uv run pytest` for isolation.
- Frontend tests use Vitest + Testing Library; see `frontend/tests/` for examples.
- Backend CI runs Ruff in the GitHub workflow; run `make lint-backend` for local Ruff checks.

## Next steps

The PLAN outlines the roadmap toward ingesting YouTube data and integrating a journaling workflow.

**Current Features:**

- ✅ AI agent with SSE streaming conversations
- ✅ Conversation persistence in SQLite
- ✅ YouTube OAuth integration

**Future Enhancements:**

- Enhanced agent capabilities
- Context-aware agent responses using Storyloop analytics
- Video detail pages with deeper analysis
