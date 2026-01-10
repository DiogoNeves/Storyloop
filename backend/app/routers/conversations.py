"""Conversation and turn management endpoints with SSE streaming."""

from __future__ import annotations

import asyncio
import json
from typing import Iterable, Literal
from contextlib import suppress
from uuid import uuid4

import logfire
import sqlite3
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_ai import messages as ai_messages
from sse_starlette.sse import EventSourceResponse

from app.db_helpers.conversations import (
    TurnRow,
    conversation_exists,
    delete_conversation,
    insert_conversation,
    insert_turn,
    list_conversation_summaries,
    list_turns,
)
from app.dependencies import get_asset_service, get_db
from app.services.agent import build_loopie_deps
from app.services.assets import AssetService

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

    @field_validator("id", mode="before")
    @classmethod
    def validate_id(cls, v: str | int | None) -> str:
        """Convert id to string."""
        return str(v) if v is not None else ""

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: str | int | None) -> str | None:
        """Convert title to string or None."""
        return str(v) if v is not None else None

    @field_validator("created_at", mode="before")
    @classmethod
    def validate_created_at(cls, v: str | int | None) -> str:
        """Convert created_at to string."""
        return str(v) if v is not None else ""


class ConversationListOut(ConversationOut):
    """Response model for a conversation summary."""

    last_turn_at: str | None
    last_turn_text: str | None
    first_turn_text: str | None
    turn_count: int

    @field_validator("last_turn_at", mode="before")
    @classmethod
    def validate_last_turn_at(cls, v: str | int | None) -> str | None:
        """Convert last_turn_at to string or None."""
        return str(v) if v is not None else None

    @field_validator("last_turn_text", mode="before")
    @classmethod
    def validate_last_turn_text(cls, v: str | int | None) -> str | None:
        """Convert last_turn_text to string or None."""
        return str(v) if v is not None else None

    @field_validator("turn_count", mode="before")
    @classmethod
    def validate_turn_count(cls, v: str | int | None) -> int:
        """Convert turn_count to int."""
        if v is None:
            return 0
        return int(v)


class TurnOut(BaseModel):
    """Response model for a turn."""

    id: str
    role: str
    text: str
    created_at: str
    attachments: list["TurnAttachmentOut"] = []


class TurnAttachmentOut(BaseModel):
    """Attachment metadata for a turn."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    url: str
    filename: str
    mime_type: str = Field(alias="mimeType")
    width: int | None = None
    height: int | None = None


class TurnFocus(BaseModel):
    """Optional focus metadata for a turn."""

    model_config = ConfigDict(extra="forbid")

    category: Literal["content", "journal"]
    id: str
    title: str | None = None
    route: str | None = None


class TurnInput(BaseModel):
    """Request model for a turn input."""

    text: str
    attachments: list[str] = Field(default_factory=list)
    focus: TurnFocus | None = None


def render_history_prompt(
    turns: list[TurnRow],
    latest_user_turn: str,
    focus: TurnFocus | None = None,
) -> str:
    """Render a prompt with the full conversation history and latest user turn."""

    if not turns:
        history_block = "No previous turns. This is the first turn in the conversation."
    else:
        history_lines = [f"{turn['role'].upper()}: {turn['text']}" for turn in turns]
        history_block = "\n".join(history_lines)

    focus_block = ""
    # Focus is ephemeral context for the current turn only.
    if focus is not None:
        focus_lines = [
            "## Current focus (optional)",
            "Use only if relevant to the latest user turn.",
            f"- Category: {focus.category}",
            f"- Item ID: {focus.id}",
        ]
        if focus.title:
            focus_lines.append(f"- Title: {focus.title}")
        if focus.route:
            focus_lines.append(f"- Route: {focus.route}")
        focus_block = "\n".join(focus_lines) + "\n\n"

    return (
        "## Conversation history (oldest to newest)\n"
        f"{history_block}\n\n"
        f"{focus_block}"
        "## Latest user turn\n"
        f"{latest_user_turn}"
    )


def _build_turn_attachments(
    asset_service: AssetService, asset_ids: Iterable[str]
) -> list[TurnAttachmentOut]:
    ids = [asset_id for asset_id in asset_ids if asset_id]
    if not ids:
        return []
    records = asset_service.list_records(ids)
    record_map = {record.id: record for record in records}
    attachments: list[TurnAttachmentOut] = []
    for asset_id in ids:
        record = record_map.get(asset_id)
        if record is None:
            continue
        meta = asset_service.get_meta(asset_id)
        attachments.append(
            TurnAttachmentOut(
                id=record.id,
                url=asset_service.resolve_url(record.id),
                filename=record.original_filename,
                mimeType=record.mime_type,
                width=meta.width if meta else None,
                height=meta.height if meta else None,
            )
        )
    return attachments


def _build_user_prompt_parts(
    asset_service: AssetService,
    prompt_with_history: str,
    attachments: Iterable[str],
) -> list[ai_messages.UserContent]:
    parts: list[ai_messages.UserContent] = [prompt_with_history]
    attachment_ids = [asset_id for asset_id in attachments if asset_id]
    if not attachment_ids:
        return parts

    records = asset_service.list_records(attachment_ids)
    record_map = {record.id: record for record in records}

    for asset_id in attachment_ids:
        record = record_map.get(asset_id)
        if record is None:
            continue
        if record.mime_type.startswith("image/"):
            data_url = asset_service.build_data_url(asset_id)
            if data_url:
                parts.append(
                    ai_messages.ImageUrl(
                        url=data_url,
                        media_type=record.mime_type,
                        identifier=record.id,
                    )
                )
            continue

        if record.mime_type == "application/pdf":
            if record.extracted_text:
                parts.append(
                    f"PDF attachment '{record.original_filename}':\n{record.extracted_text}"
                )
            else:
                parts.append(
                    f"PDF attachment '{record.original_filename}' has no extractable text."
                )

    return parts


@router.get("", response_model=list[ConversationListOut])
def list_conversations(
    db: sqlite3.Connection = Depends(get_db),
) -> list[ConversationListOut]:
    """List conversations with their most recent activity."""
    summaries = list_conversation_summaries(db)
    return [
        ConversationListOut.model_validate(summary) for summary in summaries
    ]


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_conversation(
    conversation_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> None:
    """Delete a conversation and its turns."""
    deleted = delete_conversation(db, conversation_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )


@router.post("", response_model=ConversationOut)
def create_conversation(
    body: ConversationCreate,
    db: sqlite3.Connection = Depends(get_db),
) -> ConversationOut:
    """Create a new conversation."""
    conversation_id = str(uuid4())
    result = insert_conversation(db, conversation_id, body.title)
    return ConversationOut(**result)


@router.get("/{conversation_id}/turns", response_model=list[TurnOut])
def get_turns(
    conversation_id: str,
    db: sqlite3.Connection = Depends(get_db),
    asset_service: AssetService = Depends(get_asset_service),
) -> list[TurnOut]:
    """List all turns for a conversation."""
    if not conversation_exists(db, conversation_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    turns = list_turns(db, conversation_id)
    return [
        TurnOut(
            id=turn["id"],
            role=turn["role"],
            text=turn["text"],
            created_at=turn["created_at"],
            attachments=_build_turn_attachments(
                asset_service, turn["attachments"]
            ),
        )
        for turn in turns
    ]


@router.post("/{conversation_id}/turns/stream")
async def stream_turn(
    conversation_id: str,
    body: TurnInput,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    asset_service: AssetService = Depends(get_asset_service),
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
        insert_turn,
        db,
        conversation_id,
        "user",
        body.text,
        body.attachments,
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
                    "id": "1",
                    "data": json.dumps(
                        {
                            "message": "Agent not available. Please configure OPENAI_API_KEY.",
                        }
                    ),
                }
                return

            assistant_text = ""
            assistant_turn_id: str | None = None
            event_queue: asyncio.Queue[dict | None] = asyncio.Queue()

            prior_turns = await asyncio.to_thread(
                list_turns, db, conversation_id
            )
            conversation_history = [
                turn for turn in prior_turns if turn["id"] != user_turn_id
            ]
            prompt_with_history = render_history_prompt(
                conversation_history, body.text, body.focus
            )
            user_prompt_parts = await asyncio.to_thread(
                _build_user_prompt_parts,
                asset_service,
                prompt_with_history,
                body.attachments,
            )

            async def notify_tool_call(message: str) -> None:
                await event_queue.put(
                    {
                        "event": "tool_call",
                        "data": json.dumps({"message": message}),
                    }
                )

            deps = await build_loopie_deps(
                request.app, tool_call_notifier=notify_tool_call
            )

            async def run_assistant():
                """Run assistant generation and put events in queue."""
                nonlocal assistant_text, assistant_turn_id
                try:
                    # Stream from PydanticAI agent
                    # run_stream() returns an async context manager
                    try:
                        stream_context = assistant_agent.run_stream(
                            user_prompt_parts, deps=deps
                        )
                    except TypeError:
                        # Support mocked agents that don't accept deps.
                        stream_context = assistant_agent.run_stream(
                            user_prompt_parts
                        )

                    async with stream_context as result:
                        # Iterate over the streamed text tokens
                        async for token in result.stream_text():
                            if token:
                                if token.startswith(assistant_text):
                                    delta = token[len(assistant_text) :]
                                    assistant_text = token
                                else:
                                    delta = token
                                    assistant_text += token
                                if not delta:
                                    continue
                                await event_queue.put(
                                    {
                                        "event": "token",
                                        "data": json.dumps({"token": delta}),
                                    }
                                )

                    # Generation completed - insert assistant turn
                    # Run in thread to avoid blocking event loop
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
                            "data": json.dumps(
                                {
                                    "turn_id": assistant_turn_id,
                                    "text": assistant_text,
                                }
                            ),
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
                            "data": json.dumps(
                                {"message": "Generation failed"}
                            ),
                        }
                    )
                finally:
                    # Only remove the task if it still matches the current entry.
                    if inflight.get(conversation_id) is task:
                        inflight.pop(conversation_id, None)

            # Create task and track it for cancellation
            task = asyncio.create_task(run_assistant())
            inflight[conversation_id] = task

            try:
                # Yield events from queue
                event_counter = 0
                while True:
                    event_data = await event_queue.get()
                    if event_data is None:  # Cancellation signal
                        break
                    event_counter += 1
                    yield {**event_data, "id": str(event_counter)}
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
