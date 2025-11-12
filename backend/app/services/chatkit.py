"""Service for managing OpenAI ChatKit sessions.

This service wraps the OpenAI SDK to create ChatKit sessions and manage
client tokens for authenticated chat interactions.
"""

from __future__ import annotations

from typing import Any

from openai import OpenAI

from app.config import Settings
from app.services.youtube import YoutubeConfigurationError


class ChatKitConfigurationError(Exception):
    """Raised when ChatKit is not properly configured."""

    pass


class ChatKitService:
    """Service for creating and managing ChatKit sessions."""

    def __init__(self, settings: Settings) -> None:
        """Initialize the ChatKit service with OpenAI API key and workflow ID."""
        if not settings.openai_api_key:
            raise ChatKitConfigurationError(
                "OPENAI_API_KEY is required for ChatKit integration"
            )
        self._client = OpenAI(api_key=settings.openai_api_key)
        self._workflow_id = settings.effective_chatkit_workflow_id

    def create_session(self, user_id: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        """Create a new ChatKit session for the given user.

        Args:
            user_id: The Storyloop user ID to associate with the session.
            metadata: Optional additional metadata to attach to the session.

        Returns:
            A dictionary containing the session details, including the client_secret.

        Raises:
            ChatKitConfigurationError: If session creation fails.
        """
        session_metadata = {"userId": user_id}
        if metadata:
            session_metadata.update(metadata)

        try:
            # Note: The actual API call structure may vary based on OpenAI SDK version
            # This is a placeholder implementation based on the documentation pattern
            session = self._client.chatkits.sessions.create(
                workflow_id=self._workflow_id,
                metadata=session_metadata,
            )
            return {
                "client_secret": session.client_secret.value,
                "session_id": getattr(session, "id", None),
            }
        except Exception as exc:
            raise ChatKitConfigurationError(
                f"Failed to create ChatKit session: {exc}"
            ) from exc

