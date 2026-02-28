# Storyloop

Storyloop is a journaling and guidance app for YouTube creators.

It combines:

- a FastAPI backend (SQLite, AI-assisted features, YouTube integration)
- a React frontend (daily workflow, journal editing, activity feed)

The goal is simple: help creators connect what they are trying, what happened, and what to do next.

## Quick Start

### Prerequisites

- Python 3.11
- Node.js 18+
- `uv`
- `pnpm`

### 1. Clone and install dependencies

```bash
cd backend && uv sync
cd ../frontend && pnpm install
cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Set values in `.env` as needed.

### 3. Run in development

```bash
make dev
```

Default local URLs:

- Frontend: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:8001`

## Core Environment Variables

See [.env.example](./.env.example) for the full list.

- `OPENAI_API_KEY`: enables AI features
- `YOUTUBE_API_KEY`: required when demo mode is off
- `YOUTUBE_DEMO_MODE=true`: run YouTube flows from fixtures
- `DATABASE_URL`: primary SQLite database
- `DEMO_DATABASE_URL`: demo-mode SQLite database
- `CORS_ORIGINS`: comma-separated frontend origins

## Common Commands

```bash
make dev             # frontend + backend (hot reload)
make backend         # backend only
make prod            # production-like local run
make build           # frontend production build
make lint            # backend + frontend lint
make test            # backend + frontend tests
make test-backend    # backend tests only
make test-frontend   # frontend tests only
```

## Project Layout

- `backend/` FastAPI app, services, persistence, tests
- `frontend/` React app, API hooks, components, tests
- `scripts/` developer utilities
- `thinking/` architecture notes, design docs, and product exploration

The `thinking/` folder is for deeper context. Start with this README for setup, then use `thinking/` when you want implementation rationale and planning detail.

## Open Source Governance

- [LICENSE](./LICENSE) (MIT)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Dependency and License Policy](./docs/DEPENDENCY_POLICY.md)
- [Third-Party Notices](./THIRD_PARTY_NOTICES.md)
- [GitHub Security Setup Checklist](./docs/GITHUB_SECURITY_SETUP.md)
