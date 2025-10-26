# Storyloop

Storyloop is a creator analytics journal that combines FastAPI + SQLite on the backend with a React (Vite) frontend. This boilerplate validates the toolchain end-to-end before layering in domain features such as the Storyloop Growth Score and AI-powered insights.

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

## Testing & quality gates

- Backend tests live under `backend/tests/` and rely on `uv run pytest` for isolation.
- Frontend tests use Vitest + Testing Library; see `frontend/tests/` for examples.
- Ruff, mypy, and additional tooling can be enabled later via `uv add --dev` as the surface area grows.

## Next steps

The PLAN outlines the roadmap toward ingesting YouTube data, calculating the Storyloop Growth Score, and integrating a journaling workflow. With this boilerplate in place you can begin implementing those features immediately.
