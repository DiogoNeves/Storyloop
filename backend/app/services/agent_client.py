"""Helpers for constructing Anthropic Claude SDK clients."""

from __future__ import annotations

from dataclasses import replace

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

from app.config import Settings, settings


class AnthropicConfigurationError(RuntimeError):
    """Raised when an Anthropic client cannot be created due to missing configuration."""


def build_claude_sdk_client(
    *,
    api_key: str | None = None,
    options: ClaudeAgentOptions | None = None,
    active_settings: Settings = settings,
) -> ClaudeSDKClient:
    """Create a Claude SDK client configured with the Anthropic API key.

    Args:
        api_key: Optional override for the Anthropic API key. When omitted the value
            from application settings is used.
        options: Optional Claude agent options to customize CLI behavior.
        active_settings: Settings instance used to resolve configuration defaults.

    Returns:
        A configured :class:`ClaudeSDKClient` ready for use with the Claude agent SDK.

    Raises:
        AnthropicConfigurationError: If no Anthropic API key is available from either
            the provided ``api_key`` parameter or the settings object.
    """

    resolved_api_key = api_key or active_settings.anthropic_api_key
    if not resolved_api_key:
        raise AnthropicConfigurationError(
            "ANTHROPIC_API_KEY must be configured to use the Claude SDK client."
        )

    resolved_options = options or ClaudeAgentOptions()
    merged_env = dict(resolved_options.env)
    merged_env["ANTHROPIC_API_KEY"] = resolved_api_key
    resolved_options = replace(resolved_options, env=merged_env)

    return ClaudeSDKClient(options=resolved_options)


__all__ = ["AnthropicConfigurationError", "build_claude_sdk_client"]
