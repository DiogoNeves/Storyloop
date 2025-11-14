"""Integration tests for the conversations API endpoints."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.db import SqliteConnectionFactory
from app.db_helpers.conversations import init_conversation_tables
from app.routers.conversations import router as conversations_router


def _create_test_app(
    memory_connection_factory: SqliteConnectionFactory,
    assistant_agent=None,
) -> FastAPI:
    """Create a test FastAPI app with conversations router."""
    # Initialize conversation tables
    init_conversation_tables(memory_connection_factory())

    app = FastAPI()
    app.state.get_db = memory_connection_factory
    app.state.assistant_agent = assistant_agent
    app.include_router(conversations_router, prefix="/conversations")
    return app


def test_create_conversation(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Test creating a new conversation."""
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    response = client.post("/conversations", json={"title": "Test Chat"})

    assert response.status_code == 200
    body = response.json()
    assert "id" in body
    assert body["title"] == "Test Chat"
    assert "created_at" in body


def test_create_conversation_without_title(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Test creating a conversation without a title."""
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    response = client.post("/conversations", json={})

    assert response.status_code == 200
    body = response.json()
    assert "id" in body
    assert body["title"] is None
    assert "created_at" in body


def test_get_turns_for_nonexistent_conversation(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Test getting turns for a conversation that doesn't exist."""
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    fake_id = str(uuid4())
    response = client.get(f"/conversations/{fake_id}/turns")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_get_turns_empty_conversation(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Test getting turns for an empty conversation."""
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    # Create conversation
    create_response = client.post("/conversations", json={"title": "Empty"})
    conversation_id = create_response.json()["id"]

    # Get turns
    response = client.get(f"/conversations/{conversation_id}/turns")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_stream_turn_without_agent(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Test streaming when agent is not available."""
    app = _create_test_app(memory_connection_factory, assistant_agent=None)
    transport = ASGITransport(app=app)

    # Create conversation
    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        create_response = await client.post(
            "/conversations", json={"title": "Test"}
        )
        conversation_id = create_response.json()["id"]

        # Stream turn
        async with client.stream(
            "POST",
            f"/conversations/{conversation_id}/turns/stream",
            json={"text": "Hello"},
        ) as response:
            assert response.status_code == 200

            # Read SSE events
            events = []
            async for line in response.aiter_lines():
                if line.startswith("event:"):
                    events.append(line)
                elif line.startswith("data:"):
                    events.append(line)

            # Should have error event
            assert any("error" in event for event in events)
            assert any("Agent not available" in event for event in events)


@pytest.mark.asyncio
async def test_stream_turn_with_mocked_agent(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Test streaming with a mocked agent."""

    # Create a mock agent that simulates streaming
    async def mock_stream_text():
        """Async generator that yields tokens."""
        for token in ["Hello", " ", "world", "!"]:
            yield token

    mock_result = MagicMock()
    mock_result.stream_text = mock_stream_text

    # Create a proper async context manager mock
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def mock_run_stream(*args, **kwargs):
        yield mock_result

    mock_agent = MagicMock()
    mock_agent.run_stream = mock_run_stream

    app = _create_test_app(
        memory_connection_factory, assistant_agent=mock_agent
    )
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        # Create conversation
        create_response = await client.post(
            "/conversations", json={"title": "Test"}
        )
        conversation_id = create_response.json()["id"]

        # Stream turn
        async with client.stream(
            "POST",
            f"/conversations/{conversation_id}/turns/stream",
            json={"text": "Hello"},
        ) as response:
            assert response.status_code == 200

            # Collect events
            events = []
            async for line in response.aiter_lines():
                if line.strip():
                    events.append(line)

            # Should have token events and done event
            assert any("token" in event for event in events)
            assert any("done" in event for event in events)

        # Verify turns were saved
        turns_response = await client.get(
            f"/conversations/{conversation_id}/turns"
        )
        turns = turns_response.json()
        assert len(turns) == 2  # user + assistant
        assert turns[0]["role"] == "user"
        assert turns[0]["text"] == "Hello"
        assert turns[1]["role"] == "assistant"
        assert "Hello world!" in turns[1]["text"]


@pytest.mark.asyncio
async def test_stream_turn_nonexistent_conversation(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Test streaming for a conversation that doesn't exist."""
    mock_agent = MagicMock()
    app = _create_test_app(
        memory_connection_factory, assistant_agent=mock_agent
    )
    transport = ASGITransport(app=app)

    fake_id = str(uuid4())
    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.post(
            f"/conversations/{fake_id}/turns/stream",
            json={"text": "Hello"},
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_stream_cancellation(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Test that a new stream cancels the previous one."""

    # Create a mock agent that simulates slow streaming
    async def slow_stream():
        for token in ["Token", " ", "1", " ", "2", " ", "3"]:
            yield token
            await asyncio.sleep(
                0.01
            )  # Simulate slow generation (shorter for tests)

    mock_result = MagicMock()
    mock_result.stream_text = slow_stream

    # Create a proper async context manager mock
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def mock_run_stream(*args, **kwargs):
        yield mock_result

    mock_agent = MagicMock()
    mock_agent.run_stream = mock_run_stream

    app = _create_test_app(
        memory_connection_factory, assistant_agent=mock_agent
    )
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        # Create conversation
        create_response = await client.post(
            "/conversations", json={"title": "Test"}
        )
        conversation_id = create_response.json()["id"]

        # Start first stream (will be cancelled)
        async with client.stream(
            "POST",
            f"/conversations/{conversation_id}/turns/stream",
            json={"text": "First message"},
        ):
            # Immediately start second stream (should cancel first)
            async with client.stream(
                "POST",
                f"/conversations/{conversation_id}/turns/stream",
                json={"text": "Second message"},
            ) as response:
                assert response.status_code == 200
                # Should complete successfully
                events = []
                async for line in response.aiter_lines():
                    if line.strip():
                        events.append(line)

                # Should have done event
                assert any("done" in event for event in events)

        # Verify both user turns were saved
        turns_response = await client.get(
            f"/conversations/{conversation_id}/turns"
        )
        turns = turns_response.json()
        user_turns = [t for t in turns if t["role"] == "user"]
        assert len(user_turns) == 2
        assert user_turns[0]["text"] == "First message"
        assert user_turns[1]["text"] == "Second message"


@pytest.mark.asyncio
async def test_stream_error_handling(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Test error handling when agent generation fails."""

    # Create a mock agent that raises an exception
    async def failing_stream():
        raise Exception("Generation failed")
        yield  # This will never be reached, but makes it an async generator

    mock_result = MagicMock()
    mock_result.stream_text = failing_stream

    # Create a proper async context manager mock
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def mock_run_stream(*args, **kwargs):
        yield mock_result

    mock_agent = MagicMock()
    mock_agent.run_stream = mock_run_stream

    app = _create_test_app(
        memory_connection_factory, assistant_agent=mock_agent
    )
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        # Create conversation
        create_response = await client.post(
            "/conversations", json={"title": "Test"}
        )
        conversation_id = create_response.json()["id"]

        # Stream turn
        async with client.stream(
            "POST",
            f"/conversations/{conversation_id}/turns/stream",
            json={"text": "Hello"},
        ) as response:
            assert response.status_code == 200

            # Collect events
            events = []
            async for line in response.aiter_lines():
                if line.strip():
                    events.append(line)

            # Should have error event
            assert any("error" in event for event in events)
            assert any(
                "Generation failed" in event or "failed" in event.lower()
                for event in events
            )
