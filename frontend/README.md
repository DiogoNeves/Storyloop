# Storyloop Frontend

Vite + React + TypeScript scaffold styled with Tailwind CSS and Shadcn UI tokens. React Query manages API calls to the backend `health` endpoint during the boilerplate phase.

## Scripts

```bash
pnpm run dev        # start the Vite dev server
pnpm run build      # type-check and build for production
pnpm run test -- --run  # execute Vitest in run-once mode
pnpm run lint       # ESLint flat config with type-aware rules
```

## Setup tips

- Run `pnpm install` after pulling to ensure TypeScript can resolve optional markdown dependencies used by the chat renderer.
- For demo-mode screenshots, run the FastAPI backend with `YOUTUBE_DEMO_MODE=1` so the Loopie panel and YouTube fixtures load without extra credentials.

## Key directories

- `src/components/` – shared UI components (`NavBar`, `ActivityFeed`).
- `src/lib/api.ts` – Axios instance configured against the FastAPI backend.
- `tests/` – Vitest setup and smoke tests.

Tailwind tokens are defined in `tailwind.config.js`; global theme variables live in `src/index.css`.
