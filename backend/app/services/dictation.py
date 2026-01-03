"""Audio dictation support using OpenAI transcription and title generation."""

from __future__ import annotations

import os
from typing import Final

import httpx
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel

from app.config import Settings


AUDIO_MODEL: Final[str] = "gpt-4o-transcribe"
TITLE_MODEL: Final[str] = "gpt-5-mini"
OPENAI_API_BASE: Final[str] = "https://api.openai.com/v1"


class TitleResult(BaseModel):
    """Structured response for title generation."""

    title: str


class DictationService:
    """Service for dictation transcription and title generation."""

    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.openai_api_key
        self._title_agent: Agent[None, TitleResult] | None = None

        if self._api_key:
            os.environ["OPENAI_API_KEY"] = self._api_key
            model = OpenAIChatModel(TITLE_MODEL)
            self._title_agent = Agent(
                model=model,
                result_type=TitleResult,
                system_prompt=(
                    "Generate a short, clear journal title. "
                    "Use a calm tone, 3-8 words, no quotes."
                ),
            )

    async def transcribe_audio(
        self,
        *,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> str:
        """Transcribe audio bytes to text using OpenAI."""
        self._ensure_api_key()

        headers = {
            "Authorization": f"Bearer {self._api_key}",
        }
        files = {
            "file": (filename, data, content_type),
        }
        payload = {
            "model": AUDIO_MODEL,
            "response_format": "json",
        }

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{OPENAI_API_BASE}/audio/transcriptions",
                headers=headers,
                data=payload,
                files=files,
            )
            response.raise_for_status()
            body = response.json()

        text = str(body.get("text", "")).strip()
        if not text:
            raise RuntimeError("No transcription text returned from model.")
        return text

    async def generate_title(self, *, text: str) -> str:
        """Generate a journal title from body text using GPT-5 mini."""
        self._ensure_api_key()
        if not self._title_agent:
            raise RuntimeError("Title generation is unavailable.")

        prompt = (
            "Create a journal entry title from this body text. "
            "Keep it concise and specific:\n\n"
            f"{text.strip()}"
        )
        result = await self._title_agent.run(prompt)
        title = result.data.title.strip()
        if not title:
            raise RuntimeError("No title returned from model.")
        return title

    def _ensure_api_key(self) -> None:
        if not self._api_key:
            raise RuntimeError(
                "OpenAI is not configured. Set OPENAI_API_KEY to enable dictation."
            )
