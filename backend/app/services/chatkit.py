"""Utilities for working with OpenAI ChatKit sessions."""

from __future__ import annotations

from typing import Any

from openai import OpenAI
from openai.types.beta.chatkit import ChatSession


class ChatKitConfigurationError(RuntimeError):
    """Raised when ChatKit cannot be configured due to missing settings."""


class ChatKitService:
    """High level helper that creates ChatKit sessions using the OpenAI API."""

    def __init__(
        self,
        *,
        api_key: str | None,
        workflow_id: str | None,
        default_file_uploads_enabled: bool = False,
        client: OpenAI | None = None,
    ) -> None:
        if api_key is None or not api_key:
            raise ChatKitConfigurationError(
                "OPENAI_API_KEY must be configured before creating ChatKit sessions."
            )
        if workflow_id is None or not workflow_id:
            raise ChatKitConfigurationError(
                "CHATKIT_WORKFLOW_ID must be configured before creating ChatKit sessions."
            )
        self._workflow_id = workflow_id
        self._default_file_uploads_enabled = default_file_uploads_enabled
        self._client = client or OpenAI(api_key=api_key)

    @property
    def workflow_id(self) -> str:
        """Return the workflow identifier used for sessions."""

        return self._workflow_id

    def create_session(
        self,
        *,
        user_id: str,
        enable_file_uploads: bool | None = None,
        extra_configuration: dict[str, Any] | None = None,
    ) -> ChatSession:
        """Create a new ChatKit session for the provided user identifier."""

        resolved_uploads = (
            enable_file_uploads
            if enable_file_uploads is not None
            else self._default_file_uploads_enabled
        )
        configuration: dict[str, Any] = {
            "file_upload": {"enabled": resolved_uploads},
        }
        if extra_configuration:
            configuration.update(extra_configuration)

        return self._client.beta.chatkit.sessions.create(
            user=user_id,
            workflow={"id": self._workflow_id},
            chatkit_configuration=configuration,
        )


__all__ = ["ChatKitConfigurationError", "ChatKitService"]
