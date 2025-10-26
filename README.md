# Storyloop
A local-first creative analytics app that helps content creators turn their videos into insight. Track your channel’s growth through CTR, retention, and your own “Growth Score.” Write weekly notes, see how your ideas evolve, and close the loop between storytelling and progress.

## Getting Started (Boilerplate Prep)

While the application scaffolding has not been generated yet, the high-level setup is defined in `PLAN.md`. Follow these initial steps to get your environment ready:

1. Ensure you have Python 3.11+, Node.js 18+, and npm installed.
2. Read through `PLAN.md` for the detailed backend/frontend scaffolding commands.
3. After the plan is executed you will be able to run:
   - `uv run uvicorn app.main:app --reload` from `backend/` to start the FastAPI server.
   - `npm run dev` from `frontend/` to launch the React dev server.
4. Copy `.env.example` to `.env` (once created) and fill in the required API keys (YouTube, OpenAI, Logfire).

Next up: execute the plan to generate the boilerplate so the project can run locally with a single command.
