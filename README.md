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

## AI Agent Setup

Storyloop includes a conversational AI agent powered by PydanticAI and OpenAI. The agent is optional and will be disabled if the API key is not configured (similar to YouTube OAuth).

**Current Implementation (v1):**
- ✅ SSE streaming conversations with real-time token-by-token responses
- ✅ Conversation persistence in SQLite
- ✅ Basic system prompt for YouTube creator assistance
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

The PLAN outlines the roadmap toward ingesting YouTube data, calculating the Storyloop Growth Score, and integrating a journaling workflow. See [thinking/insights.md](thinking/insights.md) for the full scoring and insights logic.

**Current Features:**

- ✅ AI agent with SSE streaming conversations
- ✅ Conversation persistence in SQLite
- ✅ YouTube OAuth integration
- ✅ Growth score calculation framework

**Future Enhancements:**

- Enhanced agent capabilities for insight tracking
- Context-aware agent responses using Storyloop analytics
- Video detail pages with deeper insights
- Background action scheduling for pattern detection
