## Storyloop Boilerplate Setup Plan

### Product & Stack Goals
- Build an analytics workspace combining YouTube data ingestion, a custom *Growth Score* (CTR × (Avg View Duration ÷ Video Length)), and a weekly reflective diary.
- Expose a FastAPI backend (Python 3.11+) using Pydantic models, APScheduler for recurring jobs, SQLite for storage, and Logfire for observability.
- Serve a lightweight React (Shadcn UI) frontend that prioritizes journaling and analytics; ChatKit agent integration will follow after v1.
- Ship a runnable “hello world” full-stack skeleton before tackling domain features.
- Reference wireframe: [Hand-drawn dashboard sketch](design/IMG_8525.png).

### Design Overview
- **Hero header:** “Storyloop | Content journal” title with quick context copy; placeholder space on the right for a future assistant/chat agent launcher (not part of v1).
- **Primary chart:** Prominent Storyloop Score line chart (time series) spanning the top half of the page; gradients or subtle accents can highlight trend changes.
- **Activity feed:** Single chronological stream beneath the chart showing system events (video published milestones, subscriber counts) alongside embedded insights and diary entries; each entry displays date, label, and summary. Plan to split into separate “Activity” and “Insights” tabs once the dataset grows.
- **Weekly journal prompt:** Within the timeline, highlight the weekly update slot for creators to reflect and log insights.
- **Empty states & future widgets:** Leave room below the timeline for expandable cards (e.g., upcoming analytics insights, recommendations).
- The design should prioritize readability, rely on a single-column flow for the main content, and keep the agent interaction visually distinct on the right-hand side.

### Repository Layout (Monorepo)
```
Storyloop/
├── backend/
│   ├── app/                # FastAPI package
│   ├── tests/              # Pytest suite
│   ├── alembic/ (optional) # If migration support is needed later
│   └── pyproject.toml      # Poetry/uv/isolated environment config
├── frontend/
│   ├── src/
│   ├── public/
│   ├── tests/              # Vitest setup
│   └── package.json
├── scripts/                # Dev/ops helpers (e.g., data sync stubs)
├── design/                 # Wireframes and visual references
├── .env.example
├── README.md
└── PLAN.md
```

### Backend Environment & Dependencies
1. **Manage environment with uv (no manual venv)**  
   ```bash
   uv python install 3.11.8
   cd backend
   uv init --python 3.11.8
   ```
2. **Install dependencies (managed via uv):**  
   ```bash
   uv add fastapi uvicorn[standard] pydantic apscheduler logfire sqlite-utils python-dotenv httpx
   uv add --dev pytest pytest-asyncio coverage mypy ruff
   ```
3. **Materialize the environment:**  
   ```bash
   uv sync  # creates/updates .venv automatically
   ```
3. **Directory scaffolding to create:**
   - `backend/app/__init__.py`
   - `backend/app/main.py` with a FastAPI instance and root `GET /health` returning “Storyloop API ready”.
   - `backend/app/config.py` loading settings (database path, API keys) from env.
   - `backend/app/db.py` initializing SQLite connection helper (using `sqlite3` + raw queries).
   - `backend/app/routers/__init__.py` and `backend/app/routers/health.py` to modularize endpoints.
   - `backend/app/scheduler.py` to register APScheduler job (placeholder logging job).
   - `backend/app/services/__init__.py` and `backend/app/services/youtube.py` (stub for future ingestion).
4. **Logging & observability:** configure Logfire in `main.py` (placeholder API key from `.env`).
5. **Testing boilerplate:** add `backend/tests/test_health.py` with a simple async test using `httpx.AsyncClient`.

### Database Setup
- Store SQLite database under `backend/.data/storyloop.db` (ensure directory exists).
- Provide thin helper utilities for executing raw SQL queries (no ORM).
- Include migration plan notes (manual SQL scripts; revisit automation once schema stabilizes).
- Seed script stub in `scripts/seed_demo_data.py` to insert mock YouTube metrics for local testing.

### Scheduler & Data Jobs
- Configure APScheduler in `scheduler.py` with:
  - Weekly job stub for aggregating external YouTube data (placeholder function logging execution).
  - Daily job stub recalculating Growth Score.
- Wire scheduler startup in FastAPI lifespan event to ensure jobs start when the app runs.

### Frontend Environment & Dependencies
1. **Scaffold React app with Vite + TypeScript:**  
   ```bash
   cd frontend
   npm create vite@latest . -- --template react-ts
   npm install
   npm install shadcn-ui@latest @radix-ui/react-dialog @tanstack/react-query axios
   npm install -D eslint prettier vitest @testing-library/react @testing-library/jest-dom
   ```
2. **Project structure to create:**
   - `frontend/src/App.tsx` showing a “Storyloop dashboard coming soon” placeholder and a basic ChartKit stub.
   - `frontend/src/components/NavBar.tsx`, `frontend/src/components/ActivityFeed.tsx` for the initial journaling experience (chat panel deferred).
   - `frontend/src/lib/api.ts` centralizing API calls (axios instance targeting FastAPI).
3. **Styling setup:** initialize Shadcn UI (`npx shadcn-ui init`) and configure Tailwind if required.
4. **Testing boilerplate:** configure Vitest in `vite.config.ts` and add `frontend/tests/App.test.tsx`.

### Shared Tooling
- `.env.example` with keys: `DATABASE_URL`, `LOGFIRE_API_KEY`, `OPENAI_API_KEY`, `YOUTUBE_API_KEY`.
- `.gitignore` updates for venv, node_modules, build artifacts, SQLite DB.
- Formatting & linting: configure `ruff.toml`, `pyproject.toml` (backend) and ESLint/Prettier settings (frontend).
- Optionally add `pre-commit` hooks for Ruff, formatting, tests.

### Dev Experience & Single Command Run
1. **Root-level task runner** using `justfile` or `Makefile`:
   ```makefile
   dev:
   	uv run uvicorn app.main:app --reload --app-dir backend &
   	cd frontend && npm run dev
   ```
   - Document how to use `direnv`/`.env` for environment variables.
2. **Alternative single script:** Python script in `scripts/dev.py` launching backend and frontend concurrently (using `subprocess`).
3. **Verify** by visiting `http://localhost:5173` (Vite dev server) to view placeholder page that fetches `/api/health`.

### Testing & Quality Gates
- Backend: `uv run pytest` with coverage; include `pytest.ini`.
- Frontend: `npm test` (Vitest) + optional playwright E2E scaffolding (defer until UI built).
- Continuous Integration plan (GitHub Actions) to run lint + tests for both stacks.

### Next Steps After Boilerplate
- Implement YouTube OAuth/data ingestion service.
- Define Growth Score calculation pipeline & persistence.
- Expand diary endpoints/models (CRUD + Markdown support).
- Integrate chat agent via ChatKit to query backend analytics.
- Build dashboard widgets (charts, tables) and diary editor UI.

### Checklist Summary
- [x] Initialize backend environment and FastAPI skeleton.
- [x] Configure SQLite, scheduler stubs, and logging.
- [x] Scaffold frontend with Vite, Shadcn UI, and journaling activity feed.
- [x] Establish testing frameworks (pytest, Vitest).
- [x] Provide single-command dev script and updated README instructions.

### Future Features
- ChatKit-powered assistant panel to query Storyloop analytics and diary entries.
- Automated weekly insights generation using external YouTube datasets.
