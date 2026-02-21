# AGENTS.md

Guidance for coding agents working in this repository.
Last verified against repo config: 2026-02-21.

## Scope and Priority

- This file applies to the whole repository.
- If instructions conflict, follow direct user instructions first, then this file.
- Also follow `good-code-rubric.md` for design and code quality direction.
- Cursor rule file exists at `.cursor/rules/test-build-planning.mdc` and is always-on.

## Stack and Layout

- Backend: Python 3.11, FastAPI, SQLite, Pydantic, PydanticAI.
- Frontend: React 19, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query.
- Package managers: `uv` (Python) and `pnpm` (Node).
- Root structure:
  - `backend/app/routers/` HTTP endpoints
  - `backend/app/services/` DB/network side effects and orchestration
  - `backend/app/db_helpers/` persistence helpers
  - `frontend/src/api/` API client and query/mutation helpers
  - `frontend/src/components/` React UI components
  - `frontend/tests/` frontend tests
  - `scripts/dev.py` dev/prod process launcher

## Build, Lint, and Test Commands

Run from repo root unless noted.

```bash
# Start local dev stack (backend + frontend, hot reload)
make dev

# Backend only (uvicorn on 127.0.0.1:8001)
make backend

# Production-like local run (build frontend + preview + prod backend)
make prod

# Frontend production build
make build

# Lint/type checks
make lint
make lint-backend      # ruff + mypy
make lint-frontend     # eslint

# Full tests
make test
make test-backend
make test-frontend
```

## Single Test Commands (Important)

Use these to avoid watch mode and keep CI-like behavior.

```bash
# Backend: single test file
cd backend && uv run pytest tests/routers/test_entries.py -v

# Backend: single test function (node id)
cd backend && uv run pytest tests/routers/test_health.py::test_health_check -v

# Backend: filter by expression
cd backend && uv run pytest -k "today_entries" -v

# Frontend: single test file (non-watch)
cd frontend && pnpm vitest run tests/TodayChecklistEditor.test.tsx

# Frontend: single test case by name
cd frontend && pnpm vitest run tests/TodayChecklistEditor.test.tsx -t "applies external updates after leaving the delete button"

# Frontend: equivalent via npm script (still non-watch)
cd frontend && pnpm run test -- --run tests/TodayChecklistEditor.test.tsx
```

## Code Style: Cross-Cutting

- Prefer small, cohesive modules; aim under ~400 lines when practical.
- Keep functional core vs side effects clear:
  - pure transforms in helper functions
  - I/O in services/API adapters
- Validate data at boundaries (Pydantic on backend, parser/schema on frontend).
- Keep naming explicit about side effects (`fetch_`, `load_`, `save_`, `compute_`).
- Avoid vague names like `utils`, `helpers`, `manager`, `common` for new modules.
- Do not hard-code secrets or environment-specific credentials.

## Python Backend Conventions

- Target Python 3.11 syntax and typing.
- Use `from __future__ import annotations` in new modules.
- Import order: stdlib, third-party, then local `app.*` imports.
- Use explicit types on public function signatures.
- Prefer `@dataclass(slots=True)` for internal records and DTO-like structures.
- Use Pydantic models for request/response and boundary validation.
- Keep router modules thin; push persistence and orchestration into services.
- Use pure conversion helpers for model mapping where possible.
- Error handling:
  - raise typed/domain exceptions in services when possible
  - map to HTTP errors in routers (see `backend/app/routers/errors.py`)
  - avoid broad `except Exception` unless re-raising with context
  - never silently swallow failures

## TypeScript/React Frontend Conventions

- TypeScript is strict (`strict: true`); avoid `any`.
- Prefer `unknown` + parsing/guards over unchecked casts.
- Use named exports for components and utilities.
- Naming:
  - Components: PascalCase
  - Hooks/util functions: camelCase
  - Hooks start with `use`
  - Types/interfaces: PascalCase
- Imports:
  - external packages first
  - internal imports via `@/` alias
  - keep type-only imports explicit (`import type { ... }`)
- Follow React Hooks rules and exhaustive deps warnings.
- Keep network and cache logic in `frontend/src/api/` and hooks, not in presentational UI.
- Reuse shared UI primitives from `frontend/src/components/ui/`.
- Add new shadcn components via CLI, not by manual copy:
  - `cd frontend && pnpm dlx shadcn@latest add <component>`
- Use `lucide-react` for icons.

## Formatting and Linting

- Respect existing formatter/linter output; avoid manual style churn.
- Frontend formatting uses Prettier with `prettier-plugin-tailwindcss`.
- Frontend linting uses `eslint` with type-aware `typescript-eslint` rules.
- Backend quality checks are `ruff` plus `mypy` via `make lint-backend`.

## Testing Conventions

- Backend:
  - test framework: `pytest`
  - async mode: `asyncio_mode = auto`
  - tests live under `backend/tests/`
- Frontend:
  - test framework: `vitest`
  - UI tests use Testing Library + `user-event`
  - tests mainly live in `frontend/tests/`
- Prefer behavior-focused tests over implementation-detail tests.
- Cover edge cases around parsing, sync, state transitions, and error paths.

## Cursor and Copilot Rules

- Cursor rules found:
  - `.cursor/rules/test-build-planning.mdc` (always apply)
  - Requires test and build validation steps in plans/todo lists for code changes.
- No `.cursorrules` file found.
- No `.github/copilot-instructions.md` file found.

## Git and Change Safety

- Do not use destructive git commands unless explicitly requested.
- Do not force-push without explicit user approval.
- Keep commits focused and descriptive.
- If the tree is dirty, do not revert unrelated user changes.
