# Repository Guidelines

Storyloop combines a FastAPI backend with a Vite/React frontend. Follow the guidance below to stay aligned with the existing tooling and workflow.

## Project Structure & Module Organization
- `backend/app/` holds FastAPI code: `main.py` configures routers, `routers/` exposes HTTP endpoints, and `services/` wraps scheduler and data helpers.
- `backend/tests/` mirrors the app layout; keep fixtures close to the modules they exercise.
- `frontend/src/` contains React features; colocate component-specific styles and hooks.
- `frontend/tests/` stores Vitest suites; prefer feature-focused directories over a flat test root.
- `scripts/` provides automation (`dev.py` to launch both stacks, `seed_demo_data.py` for sample records); `design/` tracks product references.

## Build, Test, and Development Commands
- `python scripts/dev.py` boots the FastAPI server on `:8000` and the Vite dev server on `:5173`.
- `make backend` runs `uvicorn app.main:app --reload` for backend-only work.
- `make test-backend` executes `uv run pytest` inside `backend/`.
- `make test-frontend` runs Vitest once; drop `-- --run` to enter watch mode.
- `make lint-frontend` applies the flat ESLint config to the React codebase.

## Coding Style & Naming Conventions
- Python: target Python 3.11, use 4-space indentation, keep modules typed, and group business logic in `services/`. Run `uv run ruff check backend` and `uv run mypy backend` before review when you touch backend code.
- TypeScript/React: follow the ESLint + Prettier defaults; name components with `PascalCase`, hooks/utilities with `camelCase`, and prefer function components.
- Keep environment variables in `.env`; reference them via `backend/config.py` instead of hard-coding.

## Testing Guidelines
- Backend tests should be `test_*.py` files that assert against the public API surface; rely on `asyncio_mode=auto` for async endpoints.
- Frontend tests live next to the feature or under `frontend/tests/` and should use Testing Library matchers from `@testing-library/jest-dom`.
- Aim to cover new endpoints, React hooks, and stateful components; document notable gaps in the PR description.

## Commit & Pull Request Guidelines
- Use short, present-tense commit subjects (e.g., `add health endpoint`, `fix dashboard layout`).
- Reference related issues in the body and summarize any new environment or schema changes.
- Pull requests should outline the problem, solution approach, screenshots for UI changes, and the local commands you ran (`make test-backend`, `make test-frontend`, etc.).
- Request review once checks pass; leave TODOs or follow-up tickets instead of merging partial work unflagged.
