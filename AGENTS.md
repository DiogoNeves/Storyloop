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

- Python project root lives in `backend/` (run `uv` commands there or use `uv --project backend`)
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

# Run all tests (non-interactive, CI-friendly)
make test-backend              # pytest
make test-frontend             # Vitest once with --run flag

# Run single test (IMPORTANT: use --run to avoid watch mode)
cd backend && uv run pytest tests/test_health.py::test_health_returns_healthy -v
cd frontend && pnpm vitest run tests/setup.test.ts   # --run prevents watch mode

# Watch mode (interactive development)
cd frontend && pnpm test       # Starts vitest in watch mode (will hang in CI/scripts)

# Type checking and linting
make lint                       # Runs backend + frontend checks
make lint-backend               # Backend ruff + mypy
make lint-frontend              # Frontend lint
uv run ruff check backend && uv run mypy backend
cd frontend && pnpm run lint
npx tsc --noEmit                # Frontend type check

# Seed demo data
make seed
```

## Mobile Testing

Tailscale is configured with HTTPS for testing PWA on phone. Access via Tailscale hostname.

## Master Plan

- Break problems into falsifiable steps and validate early
- Keep the end goal and current TODOs visible
- Work in short horizons, backtrack quickly on dead ends
- Confirm each step before expanding scope
- **Always include steps to run tests and build the project in planning:**
  - Add `make test` (or `make test-backend` / `make test-frontend` for specific suites) as a validation step
  - Add `make build` to verify the frontend builds successfully
  - Include these steps in todo lists for features that modify code

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
- When planning work, research what needs changing thoroughly first
- After big code changes, refactor to simplify

## Testing

- Backend: `test_*.py` files, assert public API, use `asyncio_mode=auto`
- Frontend: colocate tests or use `frontend/tests/`, Testing Library matchers from `@testing-library/jest-dom`
- Cover new endpoints, hooks, stateful components
- Create tests when developing new features
- Always run tests after implementing new features
- Document test gaps in PR description

## Repository Workflow

- Commits: short, present-tense subjects (`add health endpoint`, `fix dashboard layout`)
- Reference issues in body, summarize env/schema changes
- PRs: outline problem, solution, screenshots (UI), local commands run
- Request review after checks pass, leave TODOs for follow-up
- Use `gh` command for GitHub operations

## Good code rubric

- This repository did not begin with the Good Code rubric in place. For all new work, we should move toward it incrementally and improve what we can from now on.
- `good-code-rubric.md` is required reading before introducing or modifying code.
- Follow the rubric for coding decisions and reviews, while honoring current repo conventions.
- Stack-specific exceptions and notes are documented in `good-code-rubric.md` (especially section: `Repository adaptation notes`).

## Do Not

- Do not hard-code environment variables
- Do not use `make prod` to debug/test new functionality unless explicitly asked, use `make dev` instead
- Do not skip type checking (`ruff`, `mypy`) before backend PRs (activate `backend/.venv` first)
- Do not add shadcn components manually (use `pnpm dlx shadcn` command)
- Do not commit partial work without flagging TODOs
- Do not use destructive git commands (force push, hard reset) without explicit user request
