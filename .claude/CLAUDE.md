# Storyloop - FastAPI + React Creator Analytics Journal

## Tech Stack

- Backend: Python 3.11, FastAPI, APScheduler, SQLite, pytest
- Frontend: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Vitest
- Package managers: uv (Python), pnpm (Node)
- Icons: Lucide React

## Project Structure

- `backend/app/` - FastAPI app: `main.py` (routers), `routers/` (endpoints), `services/` (scheduler/data)
- `backend/tests/` - pytest suites mirroring app layout
- `frontend/src/` - React features with colocated styles/hooks
- `frontend/tests/` - Vitest suites, feature-focused directories
- `scripts/` - automation (`dev.py` launcher, `seed_demo_data.py`)
- `design/` - product references
- `thinking/` - project docs (architecture.md, backend-structure.md, frontend-structure.md, data-flow.md, story.md, system-diagram.md). Use `@understand-project` command to generate/update.

## Development Commands

- `python scripts/dev.py` - boot both servers (FastAPI :8000, Vite :5173)
- `make backend` - run uvicorn backend only
- `make test-backend` - run pytest in backend/
- `make test-frontend` - run Vitest once (remove `-- --run` for watch)
- `make lint-frontend` - apply flat ESLint config

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
