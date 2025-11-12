"""Claude Agent service for handling chat interactions."""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient
from claude_agent_sdk.types import Message, StreamEvent
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class AgentContext(BaseModel):
    """Context capsule for agent interactions."""

    model_config = ConfigDict(populate_by_name=True)

    current_page: str | None = Field(default=None, alias="currentPage")
    visible_items: list[dict[str, Any]] = Field(default_factory=list, alias="visibleItems")
    selected_item: dict[str, Any] | None = Field(default=None, alias="selectedItem")
    filters: dict[str, Any] = Field(default_factory=dict)
    user_context: dict[str, Any] = Field(default_factory=dict, alias="userContext")


class ChatRequest(BaseModel):
    """Request payload for agent chat."""

    model_config = ConfigDict(populate_by_name=True)

    message: str = Field(min_length=1)
    context: AgentContext | None = None
    session_id: str = Field(default="default", alias="sessionId")


class ChatChunk(BaseModel):
    """Streaming chunk from agent response."""

    model_config = ConfigDict(populate_by_name=True)

    type: str  # "message", "event", etc.
    content: str | dict[str, Any]
    session_id: str = Field(alias="sessionId")
    run_id: str | None = Field(default=None, alias="runId")


class ChatResponse(BaseModel):
    """Complete non-streaming chat response."""

    model_config = ConfigDict(populate_by_name=True)

    message: str
    session_id: str = Field(alias="sessionId")
    run_id: str | None = Field(default=None, alias="runId")


class AgentService:
    """Service for interacting with Claude Agent SDK."""

    def __init__(self, api_key: str | None = None) -> None:
        """Initialize the agent service.

        Args:
            api_key: Anthropic API key. If None, SDK will use ANTHROPIC_API_KEY env var.
        """
        # SDK uses ANTHROPIC_API_KEY from environment automatically
        # We store it here for reference but don't need to pass it explicitly
        self.api_key = api_key
        self._options = ClaudeAgentOptions()

    def _build_system_prompt(self, context: AgentContext | None) -> str:
        """Build system prompt from context."""
        base_prompt = """You are a creative partner for YouTube storytellers. You combine the creator's intent, 
the current screen state, and Storyloop's historical analytics to surface guidance that feels bespoke rather than generic.

Your role is to:
- Provide context-aware insights based on what's on screen
- Navigate Storyloop's readonly APIs confidently
- Surface comparisons, anomalies, and patterns
- Suggest actionable next steps, experiments, or trackable signals
- Remember what matters to the creator and keep watch in the background

Be supportive, data-fluent, and action-forward in every response."""

        if context:
            context_parts = []
            if context.current_page:
                context_parts.append(f"Current page: {context.current_page}")
            if context.selected_item:
                context_parts.append(f"Selected item: {context.selected_item}")
            if context.user_context:
                context_parts.append(f"User context: {context.user_context}")
            if context_parts:
                base_prompt += "\n\nCurrent context:\n" + "\n".join(context_parts)

        return base_prompt

    async def stream_chat(
        self, request: ChatRequest
    ) -> AsyncIterator[ChatChunk]:
        """Stream chat response from the agent.

        Args:
            request: Chat request with message and optional context.

        Yields:
            ChatChunk objects containing streaming response data.
        """
        try:
            async with ClaudeSDKClient(options=self._options) as client:
                # Build full prompt with context
                system_prompt = self._build_system_prompt(request.context)
                full_prompt = f"{system_prompt}\n\nUser: {request.message}"

                # Send query
                await client.query(full_prompt, session_id=request.session_id)

                # Stream responses
                async for item in client.receive_response():
                    # Handle different message types
                    if isinstance(item, Message):
                        # Extract text content from message
                        # Message types can have different structures, handle them generically
                        content = ""
                        if isinstance(item, dict):
                            # If it's a dict-like structure (TypedDict)
                            content_blocks = item.get("content", [])
                            if isinstance(content_blocks, list):
                                text_parts = []
                                for block in content_blocks:
                                    if isinstance(block, dict):
                                        # TextBlock or other block types
                                        text = block.get("text", "")
                                        if text:
                                            text_parts.append(text)
                                    elif isinstance(block, str):
                                        text_parts.append(block)
                                content = "".join(text_parts)
                            elif isinstance(content_blocks, str):
                                content = content_blocks
                        else:
                            # Try to access as object attribute
                            if hasattr(item, "content"):
                                content_attr = getattr(item, "content")
                                if isinstance(content_attr, list):
                                    text_parts = []
                                    for block in content_attr:
                                        if hasattr(block, "text"):
                                            text_parts.append(getattr(block, "text"))
                                        elif isinstance(block, str):
                                            text_parts.append(block)
                                    content = "".join(text_parts)
                                elif isinstance(content_attr, str):
                                    content = content_attr
                            else:
                                content = str(item)

                        yield ChatChunk(
                            type="message",
                            content=content,
                            session_id=request.session_id,
                            run_id=item.get("run_id") if isinstance(item, dict) else getattr(item, "run_id", None),
                        )
                    elif isinstance(item, StreamEvent):
                        # Handle stream events
                        if isinstance(item, dict):
                            content = item
                        elif hasattr(item, "model_dump"):
                            content = item.model_dump()
                        else:
                            content = {"event": str(item)}
                        yield ChatChunk(
                            type="event",
                            content=content,
                            session_id=request.session_id,
                            run_id=item.get("run_id") if isinstance(item, dict) else getattr(item, "run_id", None),
                        )
                    else:
                        # Fallback for unknown types
                        yield ChatChunk(
                            type="unknown",
                            content=str(item),
                            session_id=request.session_id,
                        )
        except Exception as e:
            logger.error("Error in stream_chat: %s", e, exc_info=True)
            yield ChatChunk(
                type="error",
                content={"error": str(e)},
                session_id=request.session_id,
            )

    async def run_chat(self, request: ChatRequest) -> ChatResponse:
        """Run chat and return complete response (non-streaming).

        Args:
            request: Chat request with message and optional context.

        Returns:
            ChatResponse with complete message and session/run IDs.
        """
        try:
            async with ClaudeSDKClient(options=self._options) as client:
                # Build full prompt with context
                system_prompt = self._build_system_prompt(request.context)
                full_prompt = f"{system_prompt}\n\nUser: {request.message}"

                # Send query
                await client.query(full_prompt, session_id=request.session_id)

                # Collect all response chunks
                message_parts = []
                run_id = None
                async for item in client.receive_response():
                    if isinstance(item, Message):
                        # Extract text content (same logic as streaming)
                        content = ""
                        if isinstance(item, dict):
                            content_blocks = item.get("content", [])
                            if isinstance(content_blocks, list):
                                for block in content_blocks:
                                    if isinstance(block, dict):
                                        text = block.get("text", "")
                                        if text:
                                            message_parts.append(text)
                                    elif isinstance(block, str):
                                        message_parts.append(block)
                            elif isinstance(content_blocks, str):
                                message_parts.append(content_blocks)
                        else:
                            if hasattr(item, "content"):
                                content_attr = getattr(item, "content")
                                if isinstance(content_attr, list):
                                    for block in content_attr:
                                        if hasattr(block, "text"):
                                            message_parts.append(getattr(block, "text"))
                                        elif isinstance(block, str):
                                            message_parts.append(block)
                                elif isinstance(content_attr, str):
                                    message_parts.append(content_attr)

                        # Capture run_id if available
                        if isinstance(item, dict):
                            run_id = item.get("run_id") or run_id
                        elif hasattr(item, "run_id"):
                            potential_run_id = getattr(item, "run_id", None)
                            if potential_run_id:
                                run_id = potential_run_id

                full_message = "".join(message_parts)

                return ChatResponse(
                    message=full_message,
                    session_id=request.session_id,
                    run_id=run_id,
                )
        except Exception as e:
            logger.error("Error in run_chat: %s", e, exc_info=True)
            raise

