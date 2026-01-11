"""Background smart journal updates for Loopie."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
import json
from typing import AsyncIterator

import anyio
import logfire
from fastapi import FastAPI

from app.services.agent import build_loopie_deps
from app.services.entries import EntryRecord, EntryService


@dataclass(slots=True)
class SmartEntryUpdateState:
    entry_id: str
    events: list[dict] = field(default_factory=list)
    subscribers: set[asyncio.Queue[dict]] = field(default_factory=set)
    task: asyncio.Task[None] | None = None
    done: bool = False


class SmartEntryUpdateManager:
    """Coordinate smart journal updates and optional streaming."""

    def __init__(
        self,
        app: FastAPI,
        entry_service: EntryService,
        *,
        concurrency_limit: int = 3,
    ) -> None:
        self._app = app
        self._entry_service = entry_service
        self._semaphore = asyncio.Semaphore(concurrency_limit)
        self._lock = asyncio.Lock()
        self._inflight: dict[str, SmartEntryUpdateState] = {}

    async def start_update(self, entry_id: str) -> SmartEntryUpdateState:
        """Start (or join) a smart update without streaming."""
        return await self._ensure_update(entry_id)

    async def stream_update(self, entry_id: str) -> AsyncIterator[dict]:
        """Start (or join) a smart update and stream events."""
        state = await self._ensure_update(entry_id)
        queue = await self._add_subscriber(state)
        event_counter = 0
        try:
            while True:
                event = await queue.get()
                event_counter += 1
                yield {**event, "id": str(event_counter)}
                if event.get("event") in ("done", "error"):
                    break
        except asyncio.CancelledError:
            # Client disconnected; do not cancel the background update.
            raise
        finally:
            await self._remove_subscriber(entry_id, state, queue)

    async def run_due_updates(self) -> None:
        """Start updates for entries that are due for refresh."""
        due_entries = await anyio.to_thread.run_sync(self._list_due_entries)
        for entry in due_entries:
            await self._ensure_update(entry.id)

    def _list_due_entries(self) -> list[EntryRecord]:
        now = datetime.now(tz=UTC)
        cutoff = now - timedelta(days=1)
        records = self._entry_service.list_smart_entries()
        return [
            record
            for record in records
            if record.last_smart_update_at is None
            or record.last_smart_update_at < cutoff
        ]

    async def _ensure_update(self, entry_id: str) -> SmartEntryUpdateState:
        async with self._lock:
            existing = self._inflight.get(entry_id)
            if existing is not None:
                return existing
            state = SmartEntryUpdateState(entry_id=entry_id)
            self._inflight[entry_id] = state
            state.task = asyncio.create_task(self._run_update(state))
            return state

    async def _add_subscriber(
        self, state: SmartEntryUpdateState
    ) -> asyncio.Queue[dict]:
        queue: asyncio.Queue[dict] = asyncio.Queue()
        for event in state.events:
            await queue.put(event)
        state.subscribers.add(queue)
        return queue

    async def _remove_subscriber(
        self, entry_id: str, state: SmartEntryUpdateState, queue: asyncio.Queue[dict]
    ) -> None:
        async with self._lock:
            state.subscribers.discard(queue)
            if state.done and not state.subscribers:
                self._inflight.pop(entry_id, None)

    async def _publish(self, state: SmartEntryUpdateState, event: dict) -> None:
        payload = dict(event)
        data = payload.get("data")
        if data is not None and not isinstance(data, (str, bytes)):
            payload["data"] = json.dumps(data)
        state.events.append(payload)
        for subscriber in list(state.subscribers):
            await subscriber.put(payload)

    async def _run_update(self, state: SmartEntryUpdateState) -> None:
        entry_id = state.entry_id
        trace = logfire.trace("smart_entry.update", entry_id=entry_id)

        @asynccontextmanager
        async def null_context():
            yield

        trace_context = trace if trace is not None else null_context()

        async with trace_context:
            async with self._semaphore:
                try:
                    entry = await anyio.to_thread.run_sync(
                        self._entry_service.get_entry, entry_id
                    )
                    if entry is None:
                        await self._publish(
                            state,
                            {
                                "event": "error",
                                "data": {"message": "Entry not found"},
                            },
                        )
                        return
                    if not entry.prompt_body:
                        await self._publish(
                            state,
                            {
                                "event": "error",
                                "data": {
                                    "message": "Entry is not a smart journal"
                                },
                            },
                        )
                        return

                    assistant_agent = getattr(
                        self._app.state, "smart_entry_agent", None
                    )
                    if assistant_agent is None:
                        await self._publish(
                            state,
                            {
                                "event": "error",
                                "data": {
                                    "message": "Agent not available."
                                },
                            },
                        )
                        return

                    prompt = render_smart_entry_prompt(entry)

                    async def notify_tool_call(message: str) -> None:
                        await self._publish(
                            state,
                            {
                                "event": "tool_call",
                                "data": {"message": message},
                            },
                        )

                    deps = await build_loopie_deps(
                        self._app, tool_call_notifier=notify_tool_call
                    )

                    assistant_text = ""
                    try:
                        stream_context = assistant_agent.run_stream(
                            prompt, deps=deps
                        )
                    except TypeError:
                        stream_context = assistant_agent.run_stream(prompt)

                    async with stream_context as result:
                        async for token in result.stream_text():
                            if not token:
                                continue
                            if token.startswith(assistant_text):
                                delta = token[len(assistant_text) :]
                                assistant_text = token
                            else:
                                delta = token
                                assistant_text += token
                            if not delta:
                                continue
                            await self._publish(
                                state,
                                {
                                    "event": "token",
                                    "data": {"token": delta},
                                },
                            )

                    await anyio.to_thread.run_sync(
                        self._entry_service.update_last_smart_update_at,
                        entry_id,
                        datetime.now(tz=UTC),
                    )
                    await self._publish(
                        state,
                        {
                            "event": "done",
                            "data": {"entry_id": entry_id, "text": assistant_text},
                        },
                    )
                except Exception as exc:  # noqa: BLE001
                    logfire.error(
                        "smart_entry.update.failed",
                        entry_id=entry_id,
                        error=str(exc),
                    )
                    await self._publish(
                        state,
                        {
                            "event": "error",
                            "data": {"message": "Smart update failed"},
                        },
                    )
                finally:
                    state.done = True
                    async with self._lock:
                        if not state.subscribers:
                            self._inflight.pop(entry_id, None)


def render_smart_entry_prompt(entry: EntryRecord) -> str:
    """Render the prompt for a smart journal entry update."""
    format_hint = entry.prompt_format.strip() if entry.prompt_format else None
    format_block = (
        f"\n\n## Format guidance\n{format_hint}"
        if format_hint
        else "\n\n## Format guidance\nNo format guidance provided."
    )
    return (
        "## Smart journal update request\n"
        f"- Entry ID: {entry.id}\n"
        f"- Title: {entry.title}\n\n"
        "## What to include\n"
        f"{entry.prompt_body}{format_block}\n\n"
        "Use read_journal_entry on the Entry ID before editing."
    )
