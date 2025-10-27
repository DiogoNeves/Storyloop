# Understand Project Architecture

Update the `thinking/` folder with a comprehensive explanation of how the Storyloop project works, including its architecture and main areas of the codebase.

## Process

1. **Check existing thinking documentation** - Read any existing files in `thinking/` to understand what's already documented
2. **Analyze codebase structure** - Examine key files to understand the project architecture. Start with these important files, but explore any other files necessary to gain a complete understanding:
   - Backend: `backend/app/main.py`, `backend/app/config.py`, `backend/app/db.py`, `backend/app/scheduler.py`
   - Services: `backend/app/services/growth.py`, `backend/app/services/youtube.py`
   - Frontend: `frontend/src/App.tsx`, `frontend/src/components/ActivityFeed.tsx`
   - Router: `backend/app/routers/health.py`
   - Config: `.env.example`, `Makefile`, `backend/pyproject.toml`, `frontend/package.json`
   - Don't limit yourself to these files—inspect additional files as needed to understand dependencies, imports, utilities, and related components
3. **Document architecture** - Create or update markdown files in `thinking/`:
   - `architecture.md` - Overall system architecture, tech stack, and component relationships
   - `backend-structure.md` - Backend organization, services, database, and scheduler
   - `frontend-structure.md` - Frontend components, API client, and UI patterns
   - `data-flow.md` - How data flows through the system
   - `story.md` - A prose storytelling-style narrative explaining what the project does and how it works
4. **Create project story** - Write a brief, engaging narrative in `story.md` that explains:
   - What problem the project solves
   - How it helps users (in this case, content creators)
   - The journey of data and interactions through the system
   - Written in an accessible, non-technical style that tells the story of the project
5. **Consider focus argument** - If provided, prioritize documenting the specific area or decision mentioned
6. **Generate system diagram** - After updating documentation, create a visual diagram showing:
   - Main components (Backend, Frontend, Database, Scheduler)
   - Key services and their relationships
   - Data flow between components
   - Display in the chat window using ASCII art or mermaid syntax

## Usage

```
@understand-project
```

Or with a focus area:

```
@understand-project focus on how the scheduler integrates with services
```

## Expected Output

- Updated markdown files in `thinking/` folder explaining project architecture
- `story.md` - A narrative explanation of the project written in prose storytelling style
- Visual diagram of the system architecture shown in chat
