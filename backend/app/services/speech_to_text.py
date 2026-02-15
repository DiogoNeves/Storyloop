"""Speech-to-text services backed by OpenAI models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Protocol, cast

from openai import OpenAI
from openai import OpenAIError

from app.config import Settings

SpeechDictationMode = Literal["loopie", "journal_note"]
_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe"
_MARKDOWN_CLEANUP_MODEL = "gpt-4o-mini"

_MARKDOWN_CLEANUP_INSTRUCTIONS = """You rewrite dictated speech into a polished markdown note body.

Rules:
- Preserve meaning exactly. Do not invent facts.
- Output valid markdown only.
- Do not include a title or top-level heading.
- Do not use code fences.
- Use short paragraphs.
- Use bullet points only when the transcript clearly implies a list.
- Remove filler words and obvious disfluencies.
- Keep tone natural and direct.
"""


@dataclass(frozen=True)
class SpeechTranscriptionResult:
    """Result payload returned to API callers."""

    text: str
    fallback_used: bool = False


class _TranscriptionsApi(Protocol):
    def create(self, **kwargs: object) -> Any: ...


class _AudioApi(Protocol):
    transcriptions: _TranscriptionsApi


class _ResponsesApi(Protocol):
    def create(self, **kwargs: object) -> Any: ...


class _SpeechClient(Protocol):
    audio: _AudioApi
    responses: _ResponsesApi


class SpeechToTextService:
    """Run audio transcription and optional markdown cleanup."""

    def __init__(
        self,
        client: _SpeechClient,
        *,
        markdown_cleanup_model: str = _MARKDOWN_CLEANUP_MODEL,
    ) -> None:
        self._client = client
        self._markdown_cleanup_model = markdown_cleanup_model

    def transcribe_dictation(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        content_type: str | None,
        mode: SpeechDictationMode,
    ) -> SpeechTranscriptionResult:
        """Transcribe an uploaded recording for a supported dictation mode."""

        if mode not in {"loopie", "journal_note"}:
            raise ValueError("Unsupported dictation mode.")

        transcript = self._transcribe_audio(
            audio_bytes=audio_bytes,
            filename=filename,
            content_type=content_type,
        )

        if mode == "loopie":
            return SpeechTranscriptionResult(text=transcript, fallback_used=False)

        formatted_text, fallback_used = self._format_as_markdown_note(transcript)
        return SpeechTranscriptionResult(
            text=formatted_text,
            fallback_used=fallback_used,
        )

    def _transcribe_audio(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        content_type: str | None,
    ) -> str:
        if not audio_bytes:
            raise ValueError("Audio file is empty.")

        normalized_type = (content_type or "application/octet-stream").strip()

        try:
            response = self._client.audio.transcriptions.create(
                file=(filename, audio_bytes, normalized_type),
                model=_TRANSCRIPTION_MODEL,
                response_format="json",
            )
        except OpenAIError as exc:
            raise RuntimeError("Could not transcribe audio.") from exc

        transcript = str(getattr(response, "text", "")).strip()
        if not transcript:
            raise RuntimeError("Could not transcribe audio.")
        return transcript

    def _format_as_markdown_note(self, transcript: str) -> tuple[str, bool]:
        try:
            response = self._client.responses.create(
                model=self._markdown_cleanup_model,
                temperature=0,
                input=[
                    {
                        "role": "system",
                        "content": _MARKDOWN_CLEANUP_INSTRUCTIONS,
                    },
                    {
                        "role": "user",
                        "content": transcript,
                    },
                ],
            )
        except OpenAIError:
            return transcript, True

        cleaned_text = _normalize_markdown_body(
            getattr(response, "output_text", None)
        )
        if not cleaned_text:
            return transcript, True
        return cleaned_text, False


def _normalize_markdown_body(value: str | None) -> str:
    if value is None:
        return ""

    normalized = value.strip()
    if not normalized:
        return ""

    if normalized.startswith("```") and normalized.endswith("```"):
        lines = normalized.splitlines()
        if len(lines) >= 2:
            normalized = "\n".join(lines[1:-1]).strip()

    return normalized


def build_speech_to_text_service(
    active_settings: Settings,
) -> SpeechToTextService | None:
    """Create speech service when OPENAI_API_KEY is configured."""

    if not active_settings.openai_api_key:
        return None

    return SpeechToTextService(
        cast(_SpeechClient, OpenAI(api_key=active_settings.openai_api_key))
    )
