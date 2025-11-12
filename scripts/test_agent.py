"""Utility script to exercise the agent endpoints."""

from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

import httpx

DEFAULT_BASE_URL = "http://localhost:8000"


async def _run_query(prompt: str, base_url: str) -> None:
    async with httpx.AsyncClient(base_url=base_url, timeout=None) as client:
        response = await client.post("/agents/query", json={"prompt": prompt})
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        print(json.dumps(payload, indent=2))


async def _run_stream(prompt: str, base_url: str) -> None:
    async with httpx.AsyncClient(base_url=base_url, timeout=None) as client:
        async with client.stream("POST", "/agents/stream", json={"prompt": prompt}) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                print(line)


async def _main() -> None:
    parser = argparse.ArgumentParser(description="Test the Storyloop agent endpoints")
    parser.add_argument("prompt", help="Prompt to send to the agent")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Base URL for the Storyloop API (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Stream the response using the streaming endpoint",
    )
    args = parser.parse_args()

    if args.stream:
        await _run_stream(args.prompt, args.base_url)
    else:
        await _run_query(args.prompt, args.base_url)


if __name__ == "__main__":
    asyncio.run(_main())
