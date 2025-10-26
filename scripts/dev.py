"""Launch the backend and frontend development servers in tandem."""

from __future__ import annotations

import asyncio
import os
import signal
import sys
from pathlib import Path
from typing import Sequence

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"


async def run_process(command: Sequence[str], cwd: Path) -> int:
    process = await asyncio.create_subprocess_exec(
        *command,
        cwd=str(cwd),
    )
    try:
        return await process.wait()
    finally:
        if process.returncode is None:
            process.terminate()


async def main() -> int:
    backend_cmd = ["uv", "run", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"]
    frontend_cmd = ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"]

    stop_event = asyncio.Event()

    loop = asyncio.get_running_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)

    backend_task = asyncio.create_task(run_process(backend_cmd, BACKEND_DIR))
    frontend_task = asyncio.create_task(run_process(frontend_cmd, FRONTEND_DIR))

    await stop_event.wait()

    backend_task.cancel()
    frontend_task.cancel()

    results = await asyncio.gather(backend_task, frontend_task, return_exceptions=True)

    exit_codes = [0]
    for result in results:
        if isinstance(result, Exception):
            if not isinstance(result, asyncio.CancelledError):
                print(f"Process exited with error: {result}", file=sys.stderr)
                exit_codes.append(1)
        else:
            exit_codes.append(int(result))

    return max(exit_codes)


if __name__ == "__main__":
    os.chdir(ROOT_DIR)
    try:
        raise SystemExit(asyncio.run(main()))
    except KeyboardInterrupt:
        raise SystemExit(0)
