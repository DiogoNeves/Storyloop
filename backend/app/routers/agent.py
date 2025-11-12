"""HTTP endpoints for Claude Agent interactions."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.dependencies import get_agent_service
from app.services import AgentService
from app.services.agent import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    agent_service: AgentService = Depends(get_agent_service),
) -> ChatResponse:
    """Handle non-streaming chat request.

    Args:
        request: Chat request with message and optional context.
        agent_service: Injected agent service.

    Returns:
        Complete chat response with message and session/run IDs.
    """
    try:
        return await agent_service.run_chat(request)
    except Exception as e:
        logger.error("Error in chat endpoint: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}") from e


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    agent_service: AgentService = Depends(get_agent_service),
) -> StreamingResponse:
    """Handle streaming chat request.

    Args:
        request: Chat request with message and optional context.
        agent_service: Injected agent service.

    Returns:
        StreamingResponse with Server-Sent Events (SSE) format.
    """
    async def generate() -> str:
        try:
            async for chunk in agent_service.stream_chat(request):
                # Format as SSE (Server-Sent Events)
                data = json.dumps(chunk.model_dump())
                yield f"data: {data}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error("Error in chat_stream endpoint: %s", e, exc_info=True)
            error_chunk = {
                "type": "error",
                "content": {"error": str(e)},
                "sessionId": request.session_id,
            }
            yield f"data: {json.dumps(error_chunk)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

