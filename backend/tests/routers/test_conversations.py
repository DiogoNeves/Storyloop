"""Integration tests for the conversations API endpoints."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
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


class ControllableAgentRun:
    """Track a single fake agent run with controllable lifecycle events."""

    def __init__(self, label: str) -> None:
        self.label = label
        self.started = asyncio.Event()
        self.finish = asyncio.Event()
        self.cancelled = asyncio.Event()
        self.cleaned_up = asyncio.Event()

    async def stream_text(self):
        """Wait until allowed to finish, yielding exactly one token."""
        self.started.set()
        try:
            await self.finish.wait()
            yield self.label
        except asyncio.CancelledError:
            self.cancelled.set()
            raise


class ControllableAgent:
    """A fake agent that exposes lifecycle hooks for each run."""

    def __init__(self) -> None:
        self.runs: list[ControllableAgentRun] = []
        self._run_added = asyncio.Event()

    async def wait_for_run_count(self, count: int, timeout: float = 5.0) -> None:
        """Wait until the requested number of runs have been registered."""
        while len(self.runs) < count:
            self._run_added.clear()
            await asyncio.wait_for(self._run_added.wait(), timeout=timeout)

    @asynccontextmanager
    async def run_stream(self, _prompt: str):  # noqa: D401 - behavior defined by context
        run = ControllableAgentRun(label=f"run-{len(self.runs) + 1}")
        self.runs.append(run)
        self._run_added.set()
        try:
            yield run
        finally:
            run.cleaned_up.set()


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


@pytest.mark.asyncio
async def test_stream_turn_emits_tool_events(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Emit SSE tool events when the agent calls helper tools."""

    async def mock_stream_text():
        yield "Hello"

    mock_result = MagicMock()
    mock_result.stream_text = mock_stream_text

    @asynccontextmanager
    async def mock_run_stream(*args, **kwargs):
        deps = kwargs.get("deps")
        if deps and getattr(deps, "tool_observer", None):
            await deps.tool_observer("load_journal_entries")
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
        create_response = await client.post(
            "/conversations", json={"title": "Tool events"}
        )
        conversation_id = create_response.json()["id"]

        async with client.stream(
            "POST",
            f"/conversations/{conversation_id}/turns/stream",
            json={"text": "Hello"},
        ) as response:
            assert response.status_code == 200

            events = []
            async for line in response.aiter_lines():
                if line.strip():
                    events.append(line)

        assert any("event: tool" in event for event in events)
        assert any("load_journal_entries" in event for event in events)
        assert any("event: done" in event for event in events)


@pytest.mark.asyncio
async def test_stream_turn_cancels_inflight_run(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    """Ensure a new stream cancels any in-flight agent run for the same conversation."""

    fake_agent = ControllableAgent()
    app = _create_test_app(memory_connection_factory, assistant_agent=fake_agent)
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        create_response = await client.post(
            "/conversations", json={"title": "Concurrency"}
        )
        conversation_id = create_response.json()["id"]
        stream_url = f"/conversations/{conversation_id}/turns/stream"

        class StreamRunner:
            """Manage an individual streaming request in the background."""

            def __init__(self, payload: dict[str, str]) -> None:
                self.payload = payload
                self.response_status: int | None = None

            async def run(self) -> list[str]:
                events: list[str] = []
                try:
                    async with client.stream(
                        "POST", stream_url, json=self.payload
                    ) as response:
                        self.response_status = response.status_code
                        async for line in response.aiter_lines():
                            if line.strip():
                                events.append(line)
                except Exception:  # noqa: BLE001 - surface original failure
                    raise
                return events

        # Start the first stream and wait until the fake agent has begun its run.
        stream1 = StreamRunner({"text": "First"})
        task1 = asyncio.create_task(stream1.run())
        await fake_agent.wait_for_run_count(1)
        run1 = fake_agent.runs[0]
        await asyncio.wait_for(run1.started.wait(), timeout=5)

        # Launch a second stream while the first is still running.
        stream2 = StreamRunner({"text": "Second"})
        task2 = asyncio.create_task(stream2.run())
        await fake_agent.wait_for_run_count(2)
        run2 = fake_agent.runs[1]
        await asyncio.wait_for(run2.started.wait(), timeout=5)

        # Allow the first run to finish and clean up while the second remains active.
        run1.finish.set()
        await asyncio.wait_for(run1.cleaned_up.wait(), timeout=5)
        _ = await task1
        assert stream1.response_status == 200
        assert run1.cancelled.is_set()

        # Start a third stream before letting the second complete.
        stream3 = StreamRunner({"text": "Third"})
        task3 = asyncio.create_task(stream3.run())
        await fake_agent.wait_for_run_count(3)
        run3 = fake_agent.runs[2]
        await asyncio.wait_for(run3.started.wait(), timeout=5)

        # The second run should be cancelled once the third begins.
        await asyncio.wait_for(run2.cancelled.wait(), timeout=5)
        await asyncio.wait_for(run2.cleaned_up.wait(), timeout=5)

        # Let the third run finish normally.
        run3.finish.set()
        await asyncio.wait_for(run3.cleaned_up.wait(), timeout=5)

        _ = await task2
        events3 = await task3

        assert stream2.response_status == 200
        assert stream3.response_status == 200
        assert run2.cancelled.is_set()
        assert not run2.finish.is_set()
        assert any("event: done" in line for line in events3)
        assert len(fake_agent.runs) == 3


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
