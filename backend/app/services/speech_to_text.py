"""Speech-to-text services backed by OpenAI transcription models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol, TypedDict, cast

from openai import APIConnectionError
from openai import APIStatusError
from openai import APITimeoutError
from openai import BadRequestError
from openai import OpenAI
from openai import OpenAIError
from openai import RateLimitError

from app.config import Settings

SpeechDictationMode = Literal["loopie", "journal_note"]
AudioPayload = bytes | bytearray
_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe"

_LOOPIE_TRANSCRIPTION_PROMPT = """Transcribe the audio directly.

Rules:
- Keep it as close as possible to what was spoken.
- Preserve meaning and wording.
- Add normal punctuation and capitalization for readability.
- Do not rewrite into a structured note.
"""

_JOURNAL_NOTE_TRANSCRIPTION_PROMPT = """Transcribe dictated journal content.

Rules:
- Preserve meaning exactly. Do not invent details.
- Decide whether this is a full note dictation:
  - Treat as a full note when there are multiple complete thoughts or roughly 25+ words.
  - Treat as uncertain when it is very short, fragmentary, or ambiguous.
- If it is a full note, format as markdown note body:
  - Use short section headings (##) based on the content themes.
  - Use bullets for implied lists, action items, or grouped points.
  - Keep concise paragraphs.
  - Do not add a top-level (#) title.
  - Do not use code fences.
- If uncertain, return a direct transcription instead of formatting.
"""

_PROMPT_BY_MODE: dict[SpeechDictationMode, str] = {
    "loopie": _LOOPIE_TRANSCRIPTION_PROMPT,
    "journal_note": _JOURNAL_NOTE_TRANSCRIPTION_PROMPT,
}
_TRANSCRIPTION_TIMEOUT_SECONDS = 30.0
_TRANSCRIPTION_MAX_RETRIES = 2
_TRANSCRIPTION_TIMEOUT_MESSAGE = "Transcription timed out. Please try again."
_TRANSCRIPTION_CONNECTION_MESSAGE = (
    "Could not reach transcription provider. Please try again."
)
_TRANSCRIPTION_RATE_LIMIT_MESSAGE = (
    "Transcription is temporarily rate-limited. Please try again."
)
_TRANSCRIPTION_PROVIDER_ERROR_MESSAGE = (
    "Transcription provider returned an unexpected error. Please try again."
)


@dataclass(frozen=True)
class SpeechTranscriptionResult:
    """Result payload returned to API callers."""

    text: str
    fallback_used: bool = False


class SpeechToTextError(Exception):
    """Base exception raised for speech-to-text failures."""


class SpeechToTextProviderError(SpeechToTextError):
    """Raised when the upstream provider request fails."""


class SpeechToTextResponseError(SpeechToTextError):
    """Raised when the provider response cannot be parsed."""


class _TranscriptionsApi(Protocol):
    def create(self, **kwargs: object) -> object: ...


class _AudioApi(Protocol):
    transcriptions: _TranscriptionsApi


class _SpeechClient(Protocol):
    audio: _AudioApi


class _TranscriptionResponseDict(TypedDict, total=False):
    text: str


class SpeechToTextService:
    """Run audio transcription for Loopie and journal dictation."""

    def __init__(self, client: _SpeechClient) -> None:
        self._client = client

    def transcribe_dictation(
        self,
        *,
        audio_bytes: AudioPayload,
        filename: str,
        content_type: str | None,
        mode: SpeechDictationMode,
    ) -> SpeechTranscriptionResult:
        """Transcribe an uploaded recording for a supported dictation mode."""

        if mode not in _PROMPT_BY_MODE:
            raise ValueError("Unsupported dictation mode.")

        transcript = self._transcribe_audio(
            audio_bytes=audio_bytes,
            filename=filename,
            content_type=content_type,
            mode=mode,
        )
        return SpeechTranscriptionResult(text=transcript, fallback_used=False)

    def _transcribe_audio(
        self,
        *,
        audio_bytes: AudioPayload,
        filename: str,
        content_type: str | None,
        mode: SpeechDictationMode,
    ) -> str:
        if not audio_bytes:
            raise ValueError("Audio file is empty.")

        normalized_audio_bytes = bytes(audio_bytes)
        normalized_type = (content_type or "application/octet-stream").strip()

        try:
            response = self._client.audio.transcriptions.create(
                file=(filename, normalized_audio_bytes, normalized_type),
                model=_TRANSCRIPTION_MODEL,
                prompt=_PROMPT_BY_MODE[mode],
                response_format="json",
            )
        except APITimeoutError as exc:
            raise SpeechToTextProviderError(_TRANSCRIPTION_TIMEOUT_MESSAGE) from exc
        except APIConnectionError as exc:
            raise SpeechToTextProviderError(_TRANSCRIPTION_CONNECTION_MESSAGE) from exc
        except RateLimitError as exc:
            raise SpeechToTextProviderError(_TRANSCRIPTION_RATE_LIMIT_MESSAGE) from exc
        except BadRequestError as exc:
            provider_message = _extract_provider_error_message(exc)
            raise SpeechToTextProviderError(provider_message) from exc
        except APIStatusError as exc:
            raise SpeechToTextProviderError(_TRANSCRIPTION_PROVIDER_ERROR_MESSAGE) from exc
        except OpenAIError as exc:
            raise SpeechToTextProviderError("Could not transcribe audio.") from exc

        transcript = _extract_response_text(response)
        if not transcript:
            raise SpeechToTextResponseError("Could not transcribe audio.")
        return transcript


def _extract_response_text(response: object) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str):
        return text.strip()

    if isinstance(response, dict):
        typed_response = cast(_TranscriptionResponseDict, response)
        dict_text = typed_response.get("text")
        if isinstance(dict_text, str):
            return dict_text.strip()

    if isinstance(response, str):
        return response.strip()

    return ""


def _extract_provider_error_message(error: BadRequestError) -> str:
    body = getattr(error, "body", None)
    if isinstance(body, dict):
        raw_error = body.get("error")
        if isinstance(raw_error, dict):
            raw_message = raw_error.get("message")
            if isinstance(raw_message, str):
                normalized_message = raw_message.strip()
                if normalized_message:
                    return normalized_message
    return "Could not transcribe audio."


def build_speech_to_text_service(
    active_settings: Settings,
) -> SpeechToTextService | None:
    """Create speech service when OPENAI_API_KEY is configured."""

    if not active_settings.openai_api_key:
        return None

    return SpeechToTextService(
        cast(
            _SpeechClient,
            OpenAI(
                api_key=active_settings.openai_api_key,
                timeout=_TRANSCRIPTION_TIMEOUT_SECONDS,
                max_retries=_TRANSCRIPTION_MAX_RETRIES,
            ),
        )
    )
