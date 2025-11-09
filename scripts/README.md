# Scripts

Helper utilities and development tools for the Storyloop project.

## Running Scripts

Scripts need access to backend dependencies managed by `uv`. You have two options:

### Option 1: Activate Virtual Environment First (Recommended)

1. Activate the backend virtual environment:

   ```bash
   cd backend
   source .venv/bin/activate  # or use your `vactivate` alias
   cd ..
   ```

2. Run scripts from the repository root:
   ```bash
   python scripts/<script_name>.py
   ```

**Example:**

```bash
cd backend
source .venv/bin/activate  # or: vactivate
cd ..
python scripts/example_script.py
```

### Option 2: Use `uv run` from Backend Directory

Run scripts using `uv run` from the `backend/` directory:

```bash
cd backend
uv run python ../scripts/<script_name>.py
```

**Example:**

```bash
cd backend
uv run python ../scripts/example_script.py
```

### Available Scripts

- **`dev.py`** – Launches both backend (FastAPI) and frontend (Vite) development servers together.

  - Run directly: `python scripts/dev.py` (after activating venv)
  - Or use the Makefile shortcut: `make dev`

- **`example_script.py`** – Example script for demonstration purposes.
  - Run with: `python scripts/example_script.py` (after activating venv)

### Why Activation is Needed

The backend virtual environment (`.venv`) is located in `backend/` and contains all the project dependencies. Scripts need access to these dependencies, so either:

- Activate the venv first (Option 1), or
- Use `uv run` from the `backend/` directory where `pyproject.toml` is located (Option 2)
