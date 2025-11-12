"""Test script for agent chat endpoints (streaming and non-streaming).

This script tests both the streaming and non-streaming agent chat endpoints.

Prerequisites:
    1. Backend server must be running (see below)
    2. ANTHROPIC_API_KEY must be set in your environment or .env file
    3. httpx must be installed (included in backend dependencies)

Setup:
    1. Ensure you have the backend dependencies installed:
       cd backend && uv sync

    2. Set your Anthropic API key in the .env file at the project root:
       echo "ANTHROPIC_API_KEY=your-key-here" >> .env

    3. Start the backend server in a separate terminal:
       python scripts/dev.py
       # OR for backend-only:
       cd backend && make backend

Usage:
    Run from the project root:
        python scripts/test_agent_chat.py

    Or using uv from the backend directory:
        cd backend && uv run python ../scripts/test_agent_chat.py

    The script will:
        - Test the non-streaming endpoint (POST /agent/chat)
        - Test the streaming endpoint (POST /agent/chat/stream)
        - Display responses in real-time for streaming tests

Endpoints tested:
    - POST /agent/chat: Non-streaming chat endpoint
    - POST /agent/chat/stream: Streaming chat endpoint (SSE format)
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx

ROOT_DIR = Path(__file__).resolve().parent.parent
BASE_URL = "http://127.0.0.1:8000"


async def test_non_streaming_chat() -> None:
    """Test the non-streaming chat endpoint."""
    print("=" * 60)
    print("Testing non-streaming chat endpoint")
    print("=" * 60)

    request_data = {
        "message": "Hello! Can you help me understand my YouTube channel performance?",
        "sessionId": "test-session-1",
        "context": {
            "currentPage": "dashboard",
            "userContext": {
                "channelId": "test-channel",
                "channelType": "education",
            },
        },
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                f"{BASE_URL}/agent/chat",
                json=request_data,
            )
            response.raise_for_status()
            result = response.json()
            print(f"\nSession ID: {result.get('sessionId')}")
            print(f"Run ID: {result.get('runId')}")
            print(f"\nResponse:\n{result.get('message', '')}\n")
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e.response.status_code}")
            print(f"Response: {e.response.text}")
            sys.exit(1)
        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)


async def test_streaming_chat() -> None:
    """Test the streaming chat endpoint."""
    print("\n" + "=" * 60)
    print("Testing streaming chat endpoint")
    print("=" * 60)

    request_data = {
        "message": "Tell me about YouTube best practices for thumbnails.",
        "sessionId": "test-session-2",
        "context": {
            "currentPage": "insights",
            "userContext": {
                "channelId": "test-channel",
                "accountStage": "growing",
            },
        },
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            async with client.stream(
                "POST",
                f"{BASE_URL}/agent/chat/stream",
                json=request_data,
            ) as response:
                response.raise_for_status()
                print("\nStreaming response (chunks):\n")
                full_message = []
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]  # Remove "data: " prefix
                        if data_str == "[DONE]":
                            print("\n--- Stream complete ---")
                            break
                        try:
                            chunk = json.loads(data_str)
                            chunk_type = chunk.get("type", "unknown")
                            content = chunk.get("content", "")
                            if chunk_type == "message":
                                if isinstance(content, str):
                                    print(content, end="", flush=True)
                                    full_message.append(content)
                                else:
                                    print(f"[{chunk_type}]: {content}")
                            elif chunk_type == "error":
                                print(f"\n[ERROR]: {content}")
                                break
                            else:
                                print(f"\n[{chunk_type}]: {content}")
                        except json.JSONDecodeError:
                            print(f"Raw line: {line}")
                print(
                    f"\n\nFull message length: {len(''.join(full_message))} characters"
                )
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e.response.status_code}")
            try:
                error_text = await e.response.aread()
                print(f"Response: {error_text.decode()}")
            except Exception:
                print(f"Response: {e.response.text}")
            sys.exit(1)
        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)


async def main() -> int:
    """Run all tests."""
    print("Agent Chat API Test Script")
    print(f"Testing endpoints at: {BASE_URL}")
    print("\nMake sure the backend server is running (python scripts/dev.py)\n")

    try:
        await test_non_streaming_chat()
        await test_streaming_chat()
        print("\n" + "=" * 60)
        print("All tests completed successfully!")
        print("=" * 60)
        return 0
    except KeyboardInterrupt:
        print("\n\nTests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
