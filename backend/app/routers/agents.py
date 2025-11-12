from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from claude_agent_sdk import ClaudeAgentOptions
from claude_agent_sdk._errors import ClaudeSDKError
from claude_agent_sdk.types import PermissionMode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.dependencies import get_agent_service
from app.services.agent import AgentService

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentOptionsPayload(BaseModel):
    """Subset of Claude agent options exposed through the API."""

    model_config = ConfigDict(extra="forbid")

    allowed_tools: list[str] | None = None
    system_prompt: str | None = None
    permission_mode: PermissionMode | None = None
    continue_conversation: bool | None = None
    resume: str | None = None
    max_turns: int | None = Field(default=None, ge=1)
    cwd: str | None = None
    cli_path: str | None = None
    settings: str | None = None
    add_dirs: list[str] | None = None
    env: dict[str, str] | None = None
    extra_args: dict[str, str | None] | None = None
    max_buffer_size: int | None = Field(default=None, ge=1)
    include_partial_messages: bool | None = None
    fork_session: bool | None = None
    user: str | None = None
    max_thinking_tokens: int | None = Field(default=None, ge=1)

    def to_sdk_options(self) -> ClaudeAgentOptions:
        """Convert payload into a ClaudeAgentOptions instance."""

        payload = self.model_dump(exclude_none=True)
        return ClaudeAgentOptions(**payload)


class AgentPromptRequest(BaseModel):
    """Request payload sent to the agent endpoints."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    prompt: str
    session_id: str | None = Field(default=None, alias="sessionId")
    options: AgentOptionsPayload | None = None


class AgentQueryResponse(BaseModel):
    """Response returned by the background query endpoint."""

    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId")
    messages: list[dict[str, Any]]


@router.post("/query", response_model=AgentQueryResponse)
async def run_agent_query(
    request: AgentPromptRequest,
    agent_service: AgentService = Depends(get_agent_service),
) -> AgentQueryResponse:
    """Run an agent query without streaming results back to the caller."""

    session_id = request.session_id or str(uuid4())
    options = request.options.to_sdk_options() if request.options else None
    try:
        messages = await agent_service.run_background(
            prompt=request.prompt, session_id=session_id, options=options
        )
    except ClaudeSDKError as exc:  # pragma: no cover - passthrough to HTTP layer
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return AgentQueryResponse(sessionId=session_id, messages=messages)


@router.post("/stream")
async def stream_agent_response(
    request: AgentPromptRequest,
    agent_service: AgentService = Depends(get_agent_service),
) -> StreamingResponse:
    """Stream agent responses using server-sent events."""

    session_id = request.session_id or str(uuid4())
    options = request.options.to_sdk_options() if request.options else None

    async def event_generator() -> AsyncIterator[str]:
        try:
            async for payload in agent_service.stream_response(
                prompt=request.prompt, session_id=session_id, options=options
            ):
                yield f"data: {json.dumps(payload)}\n\n"
        except ClaudeSDKError as exc:  # pragma: no cover - passthrough to client
            error_payload = {"session_id": session_id, "error": str(exc)}
            yield f"event: error\ndata: {json.dumps(error_payload)}\n\n"
            return

    return StreamingResponse(event_generator(), media_type="text/event-stream")
