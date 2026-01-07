# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- Backend: Python 3.11, FastAPI, SQLite, PydanticAI
- Frontend: React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- Package managers: uv (Python), pnpm (Node)
- Icons: Lucide React

## Architecture

Creator analytics journal with FastAPI backend + React frontend. Data flows: user actions → frontend → API → services → SQLite.

Key services: `YoutubeService` (API integration), PydanticAI agent (SSE streaming conversations). See `thinking/` for detailed architecture docs.

## Project Structure

- `backend/app/` - FastAPI app: `main.py` (entry), `routers/` (endpoints), `services/` (business logic), `db_helpers/` (persistence)
- `frontend/src/` - React app: `api/` (TanStack Query + Axios), `components/` (UI), `App.tsx` (dashboard)
- `scripts/` - automation (`dev.py` launcher, `seed_demo_data.py`)
- `thinking/` - architecture docs (architecture.md, backend-structure.md, frontend-structure.md, data-flow.md)

## Development Commands

```bash
# Start both servers in dev mode (FastAPI :8000, Vite :5173)
make dev

# Start both servers in prod mode (FastAPI :8000, preview :4173, offline PWA support)
make prod

# Backend only
make backend

# Run all tests
make test-backend              # pytest
make test-frontend             # Vitest once (remove `-- --run` for watch mode)

# Run single test
cd backend && uv run pytest tests/test_health.py::test_health_returns_healthy -v
cd frontend && pnpm test -- tests/setup.test.ts

# Type checking and linting
uv run ruff check backend && uv run mypy backend
cd frontend && pnpm run lint
npx tsc --noEmit                # Frontend type check

# Seed demo data
make seed
```

## Code Style

### Python
- Target Python 3.11, 4-space indentation
- Keep modules typed, run `uv run ruff check backend` and `uv run mypy backend` before review
- Group business logic in `services/`
- Prototype substantial features in standalone scripts first (minimal deps, no Logfire)
- Reference `.env` via `backend/config.py`, never hard-code

### TypeScript/React
- Follow ESLint + Prettier defaults
- Components: PascalCase; hooks/utils: camelCase
- Prefer function components
- Use shadcn components from `frontend/src/components/ui/`
- Install new primitives: `pnpm dlx shadcn@latest add <component>`
- Icons: import from `lucide-react`, reference Lucide Figma library for mockups
- Shared tokens: `src/index.css`

### Code Organization
- Export components/functions before private helpers
- Place private helpers after public code that uses them (keep helpers close to last usage)
- Maintainable code = obvious interface, type-safe, allows only correct values
- Tests cover ambiguous cases

## Testing

- Backend: `test_*.py` files, assert public API, use `asyncio_mode=auto`
- Frontend: colocate tests or use `frontend/tests/`, Testing Library matchers from `@testing-library/jest-dom`
- Cover new endpoints, hooks, stateful components
- Document test gaps in PR description

## Repository Workflow

- Commits: short, present-tense subjects (`add health endpoint`, `fix dashboard layout`)
- Reference issues in body, summarize env/schema changes
- PRs: outline problem, solution, screenshots (UI), local commands run
- Request review after checks pass, leave TODOs for follow-up
- Use `gh` command for GitHub operations

## Do Not

- Do not hard-code environment variables
- Do not skip type checking (`ruff`, `mypy`) before backend PRs
- Do not add shadcn components manually (use `pnpm dlx shadcn` command)
- Do not commit partial work without flagging TODOs
- Do not use destructive git commands (force push, hard reset) without explicit user request
