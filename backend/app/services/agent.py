from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import replace
from typing import Any

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, Message, query
from claude_agent_sdk._errors import ClaudeSDKError
from claude_agent_sdk.types import (
    AssistantMessage,
    ContentBlock,
    ResultMessage,
    StreamEvent,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)


class AgentService:
    """Coordinate interactions with the Claude Agent SDK."""

    def __init__(self, default_options: ClaudeAgentOptions | None = None) -> None:
        self._default_options = default_options or ClaudeAgentOptions()

    async def stream_response(
        self,
        *,
        prompt: str,
        session_id: str,
        options: ClaudeAgentOptions | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield serialized messages from a streaming Claude session."""

        resolved_options = self._resolve_options(options)
        async with ClaudeSDKClient(options=resolved_options) as client:
            await client.query(prompt, session_id=session_id)
            async for message in client.receive_response():
                yield {
                    "session_id": session_id,
                    "message": self._serialize_message(message),
                }

    async def run_background(
        self,
        *,
        prompt: str,
        session_id: str,
        options: ClaudeAgentOptions | None = None,
    ) -> list[dict[str, Any]]:
        """Execute a background query and return all serialized messages."""

        resolved_options = self._resolve_options(options)
        serialized_messages: list[dict[str, Any]] = []
        async for message in query(prompt=prompt, options=resolved_options):
            serialized_messages.append(self._serialize_message(message))
        return serialized_messages

    def _resolve_options(
        self, overrides: ClaudeAgentOptions | None
    ) -> ClaudeAgentOptions:
        """Merge overrides into the default Claude options."""

        base = replace(self._default_options)
        if overrides is None:
            return base
        return replace(
            base,
            allowed_tools=(
                overrides.allowed_tools
                if overrides.allowed_tools is not None
                else base.allowed_tools
            ),
            system_prompt=(
                overrides.system_prompt
                if overrides.system_prompt is not None
                else base.system_prompt
            ),
            mcp_servers=(
                overrides.mcp_servers
                if overrides.mcp_servers is not None
                else base.mcp_servers
            ),
            permission_mode=(
                overrides.permission_mode
                if overrides.permission_mode is not None
                else base.permission_mode
            ),
            continue_conversation=(
                overrides.continue_conversation
                if overrides.continue_conversation is not None
                else base.continue_conversation
            ),
            resume=(overrides.resume if overrides.resume is not None else base.resume),
            max_turns=(
                overrides.max_turns if overrides.max_turns is not None else base.max_turns
            ),
            cwd=overrides.cwd if overrides.cwd is not None else base.cwd,
            cli_path=overrides.cli_path if overrides.cli_path is not None else base.cli_path,
            settings=(
                overrides.settings if overrides.settings is not None else base.settings
            ),
            add_dirs=(
                overrides.add_dirs if overrides.add_dirs is not None else base.add_dirs
            ),
            env=overrides.env if overrides.env is not None else base.env,
            extra_args=(
                overrides.extra_args
                if overrides.extra_args is not None
                else base.extra_args
            ),
            max_buffer_size=(
                overrides.max_buffer_size
                if overrides.max_buffer_size is not None
                else base.max_buffer_size
            ),
            debug_stderr=(
                overrides.debug_stderr
                if overrides.debug_stderr is not None
                else base.debug_stderr
            ),
            stderr=overrides.stderr if overrides.stderr is not None else base.stderr,
            can_use_tool=(
                overrides.can_use_tool
                if overrides.can_use_tool is not None
                else base.can_use_tool
            ),
            hooks=overrides.hooks if overrides.hooks is not None else base.hooks,
            user=overrides.user if overrides.user is not None else base.user,
            include_partial_messages=(
                overrides.include_partial_messages
                if overrides.include_partial_messages is not None
                else base.include_partial_messages
            ),
            fork_session=(
                overrides.fork_session
                if overrides.fork_session is not None
                else base.fork_session
            ),
            agents=overrides.agents if overrides.agents is not None else base.agents,
            setting_sources=(
                overrides.setting_sources
                if overrides.setting_sources is not None
                else base.setting_sources
            ),
            plugins=overrides.plugins if overrides.plugins is not None else base.plugins,
            max_thinking_tokens=(
                overrides.max_thinking_tokens
                if overrides.max_thinking_tokens is not None
                else base.max_thinking_tokens
            ),
        )

    def _serialize_message(self, message: Message) -> dict[str, Any]:
        """Convert Claude SDK messages into JSON-serialisable dictionaries."""

        if isinstance(message, UserMessage):
            return {
                "type": "user",
                "content": self._serialize_user_content(message.content),
                "parentToolUseId": message.parent_tool_use_id,
            }
        if isinstance(message, AssistantMessage):
            return {
                "type": "assistant",
                "model": message.model,
                "content": [
                    self._serialize_content_block(block) for block in message.content
                ],
                "parentToolUseId": message.parent_tool_use_id,
            }
        if isinstance(message, SystemMessage):
            return {
                "type": "system",
                "subtype": message.subtype,
                "data": message.data,
            }
        if isinstance(message, ResultMessage):
            return {
                "type": "result",
                "subtype": message.subtype,
                "durationMs": message.duration_ms,
                "durationApiMs": message.duration_api_ms,
                "isError": message.is_error,
                "numTurns": message.num_turns,
                "sessionId": message.session_id,
                "totalCostUsd": message.total_cost_usd,
                "usage": message.usage,
                "result": message.result,
            }
        if isinstance(message, StreamEvent):
            return {
                "type": "stream_event",
                "uuid": message.uuid,
                "sessionId": message.session_id,
                "event": message.event,
                "parentToolUseId": message.parent_tool_use_id,
            }
        raise ClaudeSDKError(f"Unsupported message type: {type(message)!r}")

    def _serialize_user_content(
        self, content: str | list[ContentBlock]
    ) -> str | list[dict[str, Any]]:
        if isinstance(content, str):
            return content
        return [self._serialize_content_block(block) for block in content]

    def _serialize_content_block(self, block: ContentBlock) -> dict[str, Any]:
        if isinstance(block, TextBlock):
            return {"type": "text", "text": block.text}
        if isinstance(block, ThinkingBlock):
            return {
                "type": "thinking",
                "thinking": block.thinking,
                "signature": block.signature,
            }
        if isinstance(block, ToolUseBlock):
            return {
                "type": "tool_use",
                "id": block.id,
                "name": block.name,
                "input": block.input,
            }
        if isinstance(block, ToolResultBlock):
            return {
                "type": "tool_result",
                "toolUseId": block.tool_use_id,
                "content": block.content,
                "isError": block.is_error,
            }
        raise ClaudeSDKError(f"Unsupported content block: {type(block)!r}")
