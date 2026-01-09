"""Launch the backend and frontend servers in tandem.

Usage:
    python scripts/dev.py          # Development mode (hot reload)
    python scripts/dev.py --prod   # Production mode (builds frontend, no reload)
"""

from __future__ import annotations

import argparse
import asyncio
import os
import signal
import subprocess
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


def build_frontend(prod: bool = False) -> int:
    """Build the frontend for production."""
    print("Building frontend...")
    cmd = ["pnpm", "build"]
    if prod:
        cmd.extend(["--", "--mode", "prod"])
    result = subprocess.run(cmd, cwd=str(FRONTEND_DIR))
    return result.returncode


async def main(prod: bool = False) -> int:
    if prod:
        # Set env file path for backend
        os.environ["DOTENV_PATH"] = ".env.prod"
        # Build frontend with prod mode (uses .env.prod)
        build_result = build_frontend(prod=True)
        if build_result != 0:
            print("Frontend build failed!", file=sys.stderr)
            return build_result
        print("Frontend built successfully.\n")
    else:
        # Ensure dev runs do not inherit a prod DOTENV_PATH from a prior session
        os.environ.pop("DOTENV_PATH", None)

    backend_port = "8000" if prod else "8001"
    backend_cmd = [
        "uv",
        "run",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        backend_port,
    ]
    if not prod:
        backend_cmd.append("--reload")

    if prod:
        frontend_cmd = [
            "pnpm",
            "run",
            "preview",
            "--",
            "--host",
            "127.0.0.1",
            "--port",
            "4173",
        ]
    else:
        frontend_cmd = [
            "pnpm",
            "run",
            "dev",
            "--",
            "--host",
            "127.0.0.1",
            "--port",
            "5173",
        ]

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    signals = (signal.SIGINT, signal.SIGTERM)

    def signal_handler() -> None:
        stop_event.set()

    # Register signal handlers
    for sig in signals:
        try:
            loop.add_signal_handler(sig, signal_handler)
        except (NotImplementedError, RuntimeError):
            # Fallback for systems without async signal support
            signal.signal(sig, lambda s, f: stop_event.set())

    backend_task = asyncio.create_task(run_process(backend_cmd, BACKEND_DIR))
    frontend_task = asyncio.create_task(run_process(frontend_cmd, FRONTEND_DIR))

    try:
        await stop_event.wait()
    finally:
        # Clean up signal handlers before cancelling tasks
        for sig in signals:
            try:
                loop.remove_signal_handler(sig)
            except (ValueError, RuntimeError):
                pass

        backend_task.cancel()
        frontend_task.cancel()

    results = await asyncio.gather(
        backend_task, frontend_task, return_exceptions=True
    )

    exit_codes = [0]
    for result in results:
        if isinstance(result, Exception):
            if not isinstance(result, asyncio.CancelledError):
                print(f"Process exited with error: {result}", file=sys.stderr)
                exit_codes.append(1)
        elif isinstance(result, int):
            exit_codes.append(result)
        else:
            # Handle other BaseException types (shouldn't happen, but type checker needs this)
            print(
                f"Process exited with unexpected error: {result}",
                file=sys.stderr,
            )
            exit_codes.append(1)

    return max(exit_codes)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Launch backend and frontend servers"
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Run in production mode (builds frontend, no hot reload)",
    )
    args = parser.parse_args()

    os.chdir(ROOT_DIR)
    try:
        raise SystemExit(asyncio.run(main(prod=args.prod)))
    except KeyboardInterrupt:
        raise SystemExit(0)
