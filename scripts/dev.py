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
import socket
import subprocess
import sys
from pathlib import Path
from typing import Sequence

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"")
        os.environ.setdefault(key, value)


async def run_process(command: Sequence[str], cwd: Path) -> int:
    process = await asyncio.create_subprocess_exec(
        *command,
        cwd=str(cwd),
        start_new_session=True,
    )
    try:
        return await process.wait()
    except asyncio.CancelledError:
        if process.returncode is None:
            _terminate_process(process)
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                _kill_process(process)
                await process.wait()
        raise


def _terminate_process(process: asyncio.subprocess.Process) -> None:
    if hasattr(os, "killpg"):
        os.killpg(process.pid, signal.SIGTERM)
        return
    process.terminate()


def _kill_process(process: asyncio.subprocess.Process) -> None:
    if hasattr(os, "killpg"):
        os.killpg(process.pid, signal.SIGKILL)
        return
    process.kill()


def build_frontend(prod: bool = False) -> int:
    """Build the frontend for production."""
    print("Building frontend...")
    cmd = ["pnpm", "build"]
    if prod:
        cmd.extend(["--mode", "prod"])
    result = subprocess.run(cmd, cwd=str(FRONTEND_DIR))
    return result.returncode


def _parse_port(value: str, label: str) -> int:
    try:
        port = int(value)
    except ValueError as exc:
        raise ValueError(f"{label} must be an integer (got {value!r}).") from exc
    if not 1 <= port <= 65535:
        raise ValueError(f"{label} must be between 1 and 65535 (got {port}).")
    return port


def _port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def _validate_ports(
    backend_host: str,
    backend_port: int,
    frontend_host: str,
    frontend_port: int,
) -> bool:
    ok = True
    if not _port_available(backend_host, backend_port):
        print(
            f"Backend port {backend_port} on {backend_host} is already in use.",
            file=sys.stderr,
        )
        ok = False
    if not _port_available(frontend_host, frontend_port):
        print(
            f"Frontend port {frontend_port} on {frontend_host} is already in use.",
            file=sys.stderr,
        )
        ok = False
    if not ok:
        print(
            "Set BACKEND_PORT/FRONTEND_PORT to override, or stop the process using the port.",
            file=sys.stderr,
        )
    return ok


def _load_runtime_env(prod: bool) -> None:
    if prod:
        env_prod_path = ROOT_DIR / ".env.prod"
        if env_prod_path.exists():
            os.environ["DOTENV_PATH"] = ".env.prod"
            load_env_file(env_prod_path)
            return
        print(
            ".env.prod not found. Falling back to .env for make prod.",
            file=sys.stderr,
        )

    os.environ.pop("DOTENV_PATH", None)
    load_env_file(ROOT_DIR / ".env")


def _ensure_youtube_mode() -> None:
    if os.getenv("YOUTUBE_API_KEY"):
        return

    demo_mode_raw = os.getenv("YOUTUBE_DEMO_MODE", "")
    demo_mode = demo_mode_raw.strip().lower()
    if demo_mode in {"1", "true", "yes", "on"}:
        return

    os.environ["YOUTUBE_DEMO_MODE"] = "true"
    print(
        "YOUTUBE_API_KEY not set. Enabling YOUTUBE_DEMO_MODE=true for local run.",
        file=sys.stderr,
    )


async def main(prod: bool = False) -> int:
    _load_runtime_env(prod=prod)
    _ensure_youtube_mode()

    if prod:
        # Build frontend with prod mode (uses .env.prod)
        build_result = build_frontend(prod=True)
        if build_result != 0:
            print("Frontend build failed!", file=sys.stderr)
            return build_result
        print("Frontend built successfully.\n")

    backend_host = "127.0.0.1"
    frontend_host = "127.0.0.1"
    try:
        backend_port = _parse_port(
            os.getenv("BACKEND_PORT", "8000" if prod else "8001"),
            "BACKEND_PORT",
        )
        frontend_port = _parse_port(
            os.getenv("FRONTEND_PORT", "4173" if prod else "5173"),
            "FRONTEND_PORT",
        )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if not _validate_ports(
        backend_host, backend_port, frontend_host, frontend_port
    ):
        return 1
    backend_cmd = [
        "uv",
        "run",
        "uvicorn",
        "app.main:app",
        "--host",
        backend_host,
        "--port",
        str(backend_port),
    ]
    if not prod:
        backend_cmd.append("--reload")

    if prod:
        frontend_cmd = [
            "pnpm",
            "exec",
            "vite",
            "preview",
            "--host",
            frontend_host,
            "--port",
            str(frontend_port),
        ]
    else:
        frontend_cmd = [
            "pnpm",
            "exec",
            "vite",
            "--host",
            frontend_host,
            "--port",
            str(frontend_port),
        ]

    stop_event = asyncio.Event()
    signal_received = False
    loop = asyncio.get_running_loop()
    signals = (signal.SIGINT, signal.SIGTERM)

    def signal_handler() -> None:
        nonlocal signal_received
        signal_received = True
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
    stop_task = asyncio.create_task(stop_event.wait())

    try:
        done, _pending = await asyncio.wait(
            {backend_task, frontend_task, stop_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if stop_task not in done:
            for task, label in (
                (backend_task, "backend"),
                (frontend_task, "frontend"),
            ):
                if task in done:
                    try:
                        exit_code = task.result()
                    except Exception as exc:  # pragma: no cover - unexpected
                        print(
                            f"{label} process failed: {exc}",
                            file=sys.stderr,
                        )
                        exit_code = 1
                    else:
                        print(
                            f"{label} process exited with code {exit_code}.",
                            file=sys.stderr,
                        )
            stop_event.set()
    finally:
        # Clean up signal handlers before cancelling tasks
        for sig in signals:
            try:
                loop.remove_signal_handler(sig)
            except (ValueError, RuntimeError):
                pass

        backend_task.cancel()
        frontend_task.cancel()
        stop_task.cancel()

    results = await asyncio.gather(
        backend_task, frontend_task, return_exceptions=True
    )

    if signal_received:
        return 0

    exit_codes = [0]
    for result in results:
        if isinstance(result, asyncio.CancelledError):
            continue
        if isinstance(result, BaseException):
            print(f"Process exited with error: {result}", file=sys.stderr)
            exit_codes.append(1)
        elif isinstance(result, int):
            exit_codes.append(result)

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
