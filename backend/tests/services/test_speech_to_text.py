"""Unit tests for speech-to-text service behaviors."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

import pytest
from openai import OpenAIError

from app.services.speech_to_text import SpeechToTextService


@dataclass
class _FakeTranscriptionResponse:
    text: str


@dataclass
class _FakeCleanupResponse:
    output_text: str


class _FakeTranscriptionsAPI:
    def __init__(self, text: str) -> None:
        self._text = text

    def create(self, **_kwargs: object) -> _FakeTranscriptionResponse:
        return _FakeTranscriptionResponse(text=self._text)


class _FakeAudioAPI:
    def __init__(self, text: str) -> None:
        self.transcriptions = _FakeTranscriptionsAPI(text)


class _FakeResponsesAPI:
    def __init__(self, output_text: str | None = None) -> None:
        self._output_text = output_text

    def create(self, **_kwargs: object) -> _FakeCleanupResponse:
        return _FakeCleanupResponse(output_text=self._output_text or "")


class _FailingResponsesAPI:
    def create(self, **_kwargs: object) -> _FakeCleanupResponse:
        raise OpenAIError("cleanup failed")


class _FakeClient:
    def __init__(self, transcript: str, cleanup_api: object) -> None:
        self.audio = _FakeAudioAPI(transcript)
        self.responses = cleanup_api


def test_transcribe_loopie_returns_raw_transcript() -> None:
    service = SpeechToTextService(
        cast(Any, _FakeClient("  draft for loopie  ", _FakeResponsesAPI()))
    )

    result = service.transcribe_dictation(
        audio_bytes=b"audio-bytes",
        filename="recording.webm",
        content_type="audio/webm",
        mode="loopie",
    )

    assert result.text == "draft for loopie"
    assert result.fallback_used is False


def test_transcribe_journal_note_returns_cleaned_markdown() -> None:
    service = SpeechToTextService(
        cast(
            Any,
            _FakeClient(
                "voice memo transcript",
                _FakeResponsesAPI("Polished paragraph.\n\n- Action item"),
            ),
        )
    )

    result = service.transcribe_dictation(
        audio_bytes=b"audio-bytes",
        filename="recording.webm",
        content_type="audio/webm",
        mode="journal_note",
    )

    assert result.text == "Polished paragraph.\n\n- Action item"
    assert result.fallback_used is False


def test_transcribe_journal_note_uses_raw_transcript_on_cleanup_failure() -> None:
    service = SpeechToTextService(
        cast(Any, _FakeClient("voice memo transcript", _FailingResponsesAPI()))
    )

    result = service.transcribe_dictation(
        audio_bytes=b"audio-bytes",
        filename="recording.webm",
        content_type="audio/webm",
        mode="journal_note",
    )

    assert result.text == "voice memo transcript"
    assert result.fallback_used is True


def test_transcribe_journal_note_strips_wrapping_code_fence() -> None:
    service = SpeechToTextService(
        cast(
            Any,
            _FakeClient(
                "voice memo transcript",
                _FakeResponsesAPI("```markdown\nPolished paragraph\n```"),
            ),
        )
    )

    result = service.transcribe_dictation(
        audio_bytes=b"audio-bytes",
        filename="recording.webm",
        content_type="audio/webm",
        mode="journal_note",
    )

    assert result.text == "Polished paragraph"
    assert result.fallback_used is False


@pytest.mark.parametrize("mode", ["invalid", "", "notes"])
def test_transcribe_raises_for_unsupported_mode(mode: str) -> None:
    service = SpeechToTextService(
        cast(Any, _FakeClient("voice memo transcript", _FakeResponsesAPI()))
    )

    with pytest.raises(ValueError, match="Unsupported dictation mode"):
        service.transcribe_dictation(
            audio_bytes=b"audio-bytes",
            filename="recording.webm",
            content_type="audio/webm",
            mode=mode,  # type: ignore[arg-type]
        )
