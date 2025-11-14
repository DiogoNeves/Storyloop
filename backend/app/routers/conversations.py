"""Conversation and turn management endpoints with SSE streaming."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from uuid import uuid4

import logfire
import sqlite3
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.db_helpers.conversations import (
    conversation_exists,
    insert_conversation,
    insert_turn,
    list_turns,
)
from app.dependencies import get_db

router = APIRouter()

# Module-level state for tracking in-flight generation tasks
inflight: dict[str, asyncio.Task] = {}


class ConversationCreate(BaseModel):
    """Request model for creating a conversation."""

    title: str | None = None


class ConversationOut(BaseModel):
    """Response model for a conversation."""

    id: str
    title: str | None
    created_at: str


class TurnOut(BaseModel):
    """Response model for a turn."""

    id: str
    role: str
    text: str
    created_at: str


class TurnInput(BaseModel):
    """Request model for a turn input."""

    text: str


@router.post("", response_model=ConversationOut)
def create_conversation(
    body: ConversationCreate,
    db: sqlite3.Connection = Depends(get_db),
) -> ConversationOut:
    """Create a new conversation."""
    conversation_id = str(uuid4())
    result = insert_conversation(db, conversation_id, body.title)
    # result dict matches ConversationOut: id and created_at are always str, title can be None
    return ConversationOut(**result)  # type: ignore[arg-type]


@router.get("/{conversation_id}/turns", response_model=list[TurnOut])
def get_turns(
    conversation_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> list[TurnOut]:
    """List all turns for a conversation."""
    if not conversation_exists(db, conversation_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    turns = list_turns(db, conversation_id)
    return [TurnOut(**turn) for turn in turns]


@router.post("/{conversation_id}/turns/stream")
async def stream_turn(
    conversation_id: str,
    body: TurnInput,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> EventSourceResponse:
    """Stream assistant response for a user message."""
    # Check conversation exists (run in thread to avoid blocking event loop)
    exists = await asyncio.to_thread(conversation_exists, db, conversation_id)
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    # Insert user turn immediately (run in thread to avoid blocking event loop)
    user_turn_id = await asyncio.to_thread(
        insert_turn, db, conversation_id, "user", body.text
    )

    # Cancel any existing task for this conversation
    pending = inflight.get(conversation_id)
    if pending and not pending.done():
        pending.cancel()

    async def event_generator():
        """Generate SSE events for streaming tokens."""
        trace = logfire.trace(
            "assistant.turn",
            conversation_id=conversation_id,
            user_turn_id=user_turn_id,
        )

        # Handle case where trace might be None (Logfire not configured)
        # Use a no-op async context manager if trace is None
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def null_context():
            yield

        trace_context = trace if trace is not None else null_context()

        async with trace_context:
            assistant_agent = request.app.state.assistant_agent
            if assistant_agent is None:
                yield {
                    "event": "error",
                    "data": {
                        "message": "Agent not available. Please configure OPENAI_API_KEY."
                    },
                }
                return

            assistant_text_parts: list[str] = []
            assistant_turn_id: str | None = None
            event_queue: asyncio.Queue[dict | None] = asyncio.Queue()

            async def run_assistant():
                """Run assistant generation and put events in queue."""
                nonlocal assistant_turn_id
                try:
                    # Stream from PydanticAI agent
                    # run_stream() returns an async context manager
                    async with assistant_agent.run_stream(body.text) as result:
                        # Iterate over the streamed text tokens
                        async for token in result.stream_text():
                            if token:
                                assistant_text_parts.append(token)
                                await event_queue.put(
                                    {
                                        "event": "token",
                                        "data": {"token": token},
                                    }
                                )

                    # Generation completed - insert assistant turn
                    # Run in thread to avoid blocking event loop
                    assistant_text = "".join(assistant_text_parts)
                    assistant_turn_id = await asyncio.to_thread(
                        insert_turn,
                        db,
                        conversation_id,
                        "assistant",
                        assistant_text,
                    )
                    if trace is not None:
                        trace.set_attribute(
                            "assistant_turn_id", assistant_turn_id
                        )
                    await event_queue.put(
                        {
                            "event": "done",
                            "data": {
                                "turn_id": assistant_turn_id,
                                "text": assistant_text,
                            },
                        }
                    )
                except asyncio.CancelledError:
                    logfire.info(
                        "assistant.turn.cancelled",
                        conversation_id=conversation_id,
                        user_turn_id=user_turn_id,
                    )
                    await event_queue.put(None)  # Signal cancellation
                    raise
                except Exception as exc:  # noqa: BLE001
                    logfire.error(
                        "assistant.turn.failed",
                        conversation_id=conversation_id,
                        user_turn_id=user_turn_id,
                        error=str(exc),
                    )
                    await event_queue.put(
                        {
                            "event": "error",
                            "data": {"message": "Generation failed"},
                        }
                    )
                finally:
                    inflight.pop(conversation_id, None)

            # Create task and track it for cancellation
            task = asyncio.create_task(run_assistant())
            inflight[conversation_id] = task

            try:
                # Yield events from queue
                while True:
                    event_data = await event_queue.get()
                    if event_data is None:  # Cancellation signal
                        break
                    yield event_data
                    # Break after done or error event
                    if event_data.get("event") in ("done", "error"):
                        break
            except asyncio.CancelledError:
                task.cancel()
                with suppress(Exception):
                    await task
                raise

    return EventSourceResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )
