"""Utilities for interacting with the ChatKit Sessions API."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


class ChatkitError(Exception):
    """Raised when ChatKit encounters an unexpected failure."""


class ChatkitConfigurationError(ChatkitError):
    """Raised when ChatKit is not configured correctly."""


@dataclass(slots=True)
class ChatkitSession:
    """Minimal representation of a ChatKit session."""

    client_secret: str
    session_id: str | None = None


class ChatkitService:
    """Lightweight client for the ChatKit Sessions API."""

    _DEFAULT_BASE_URL = "https://api.openai.com/v1"

    def __init__(self, *, api_key: str, base_url: str | None = None) -> None:
        if not api_key:
            raise ChatkitConfigurationError(
                "An OpenAI API key is required to create ChatKit sessions."
            )
        self._api_key = api_key
        self._base_url = (base_url or self._DEFAULT_BASE_URL).rstrip("/")

    async def create_session(self, *, user_id: str | None = None) -> ChatkitSession:
        """Create a short-lived ChatKit session token."""

        payload: dict[str, Any] = {}
        metadata: dict[str, str] = {}
        if user_id:
            metadata["userId"] = user_id
        if metadata:
            payload["metadata"] = metadata

        url = f"{self._base_url}/chatkits/sessions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(url, json=payload or None, headers=headers)
            except httpx.HTTPError as exc:  # pragma: no cover - network failure
                raise ChatkitError("Unable to contact ChatKit API") from exc

        if response.status_code != httpx.codes.OK:
            detail = response.text
            raise ChatkitError(
                f"ChatKit session creation failed ({response.status_code}): {detail}"
            )

        data = response.json()
        client_secret = data.get("client_secret", {}).get("value")
        if not client_secret:
            raise ChatkitError("ChatKit response did not include a client secret")

        return ChatkitSession(client_secret=client_secret, session_id=data.get("id"))

