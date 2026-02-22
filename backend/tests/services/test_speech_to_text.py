"""Unit tests for speech-to-text service behaviors."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

import httpx
import pytest
from openai import APIConnectionError
from openai import APITimeoutError
from openai import BadRequestError
from openai import OpenAIError

from app.services import speech_to_text
from app.services.speech_to_text import (
    SpeechToTextProviderError,
    SpeechToTextResponseError,
    SpeechToTextService,
)


@dataclass
class _FakeTranscriptionResponse:
    text: str


class _FakeTranscriptionsAPI:
    def __init__(self, outputs: list[str | Exception] | None = None) -> None:
        self._outputs = outputs or ["transcript"]
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> _FakeTranscriptionResponse:
        self.calls.append(dict(kwargs))
        if not self._outputs:
            return _FakeTranscriptionResponse(text="")

        next_output = self._outputs.pop(0)
        if isinstance(next_output, Exception):
            raise next_output
        return _FakeTranscriptionResponse(text=next_output)


class _FakeAudioAPI:
    def __init__(self, transcriptions_api: _FakeTranscriptionsAPI) -> None:
        self.transcriptions = transcriptions_api


class _FakeClient:
    def __init__(self, transcriptions_api: _FakeTranscriptionsAPI) -> None:
        self.audio = _FakeAudioAPI(transcriptions_api)


def test_transcribe_loopie_returns_raw_transcript() -> None:
    transcriptions_api = _FakeTranscriptionsAPI(["  draft for loopie  "])
    service = SpeechToTextService(cast(Any, _FakeClient(transcriptions_api)))

    result = service.transcribe_dictation(
        audio_bytes=b"audio-bytes",
        filename="recording.webm",
        content_type="audio/webm",
        mode="loopie",
    )

    assert result.text == "draft for loopie"
    assert result.fallback_used is False
    assert transcriptions_api.calls[0]["prompt"] == (
        speech_to_text._LOOPIE_TRANSCRIPTION_PROMPT
    )


def test_transcribe_journal_note_uses_transcription_prompt_only() -> None:
    transcriptions_api = _FakeTranscriptionsAPI(
        ["## Summary\n\nCaptured with markdown formatting."]
    )
    service = SpeechToTextService(cast(Any, _FakeClient(transcriptions_api)))

    result = service.transcribe_dictation(
        audio_bytes=b"audio-bytes",
        filename="recording.webm",
        content_type="audio/webm",
        mode="journal_note",
    )

    assert result.text == "## Summary\n\nCaptured with markdown formatting."
    assert result.fallback_used is False
    assert transcriptions_api.calls[0]["prompt"] == (
        speech_to_text._JOURNAL_NOTE_TRANSCRIPTION_PROMPT
    )


def test_transcribe_normalizes_bytearray_payload_to_bytes() -> None:
    transcriptions_api = _FakeTranscriptionsAPI(["dictated text"])
    service = SpeechToTextService(cast(Any, _FakeClient(transcriptions_api)))

    service.transcribe_dictation(
        audio_bytes=bytearray(b"audio-bytes"),
        filename="recording.webm",
        content_type="audio/webm",
        mode="loopie",
    )

    file_upload = transcriptions_api.calls[0]["file"]
    assert isinstance(file_upload, tuple)
    assert isinstance(file_upload[1], bytes)


def test_transcribe_modes_use_different_prompts() -> None:
    transcriptions_api = _FakeTranscriptionsAPI(["one", "two"])
    service = SpeechToTextService(cast(Any, _FakeClient(transcriptions_api)))

    service.transcribe_dictation(
        audio_bytes=b"audio-bytes",
        filename="recording.webm",
        content_type="audio/webm",
        mode="loopie",
    )
    service.transcribe_dictation(
        audio_bytes=b"audio-bytes",
        filename="recording.webm",
        content_type="audio/webm",
        mode="journal_note",
    )

    assert transcriptions_api.calls[0]["prompt"] != transcriptions_api.calls[1][
        "prompt"
    ]


def test_transcribe_raises_runtime_error_when_openai_fails() -> None:
    transcriptions_api = _FakeTranscriptionsAPI([OpenAIError("transcription failed")])
    service = SpeechToTextService(cast(Any, _FakeClient(transcriptions_api)))

    with pytest.raises(SpeechToTextProviderError, match="Could not transcribe audio"):
        service.transcribe_dictation(
            audio_bytes=b"audio-bytes",
            filename="recording.webm",
            content_type="audio/webm",
            mode="loopie",
        )


def test_transcribe_raises_timeout_error_when_openai_times_out() -> None:
    transcriptions_api = _FakeTranscriptionsAPI(
        [
            APITimeoutError(
                request=httpx.Request(
                    "POST", "https://api.openai.com/v1/audio/transcriptions"
                )
            )
        ]
    )
    service = SpeechToTextService(cast(Any, _FakeClient(transcriptions_api)))

    with pytest.raises(
        SpeechToTextProviderError, match="Transcription timed out. Please try again."
    ):
        service.transcribe_dictation(
            audio_bytes=b"audio-bytes",
            filename="recording.webm",
            content_type="audio/webm",
            mode="loopie",
        )


def test_transcribe_raises_connection_error_when_openai_unreachable() -> None:
    transcriptions_api = _FakeTranscriptionsAPI(
        [
            APIConnectionError(
                message="Connection error.",
                request=httpx.Request(
                    "POST", "https://api.openai.com/v1/audio/transcriptions"
                ),
            )
        ]
    )
    service = SpeechToTextService(cast(Any, _FakeClient(transcriptions_api)))

    with pytest.raises(
        SpeechToTextProviderError,
        match="Could not reach transcription provider. Please try again.",
    ):
        service.transcribe_dictation(
            audio_bytes=b"audio-bytes",
            filename="recording.webm",
            content_type="audio/webm",
            mode="loopie",
        )


def test_transcribe_returns_provider_bad_request_message() -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/audio/transcriptions")
    response = httpx.Response(status_code=400, request=request)
    transcriptions_api = _FakeTranscriptionsAPI(
        [
            BadRequestError(
                "Bad request",
                response=response,
                body={"error": {"message": "Unsupported file format webm"}},
            )
        ]
    )
    service = SpeechToTextService(cast(Any, _FakeClient(transcriptions_api)))

    with pytest.raises(
        SpeechToTextProviderError, match="Unsupported file format webm"
    ):
        service.transcribe_dictation(
            audio_bytes=b"audio-bytes",
            filename="recording.webm",
            content_type="audio/webm",
            mode="loopie",
        )


def test_transcribe_raises_runtime_error_when_transcript_is_empty() -> None:
    transcriptions_api = _FakeTranscriptionsAPI(["   "])
    service = SpeechToTextService(cast(Any, _FakeClient(transcriptions_api)))

    with pytest.raises(SpeechToTextResponseError, match="Could not transcribe audio"):
        service.transcribe_dictation(
            audio_bytes=b"audio-bytes",
            filename="recording.webm",
            content_type="audio/webm",
            mode="loopie",
        )


@pytest.mark.parametrize("mode", ["invalid", "", "notes"])
def test_transcribe_raises_for_unsupported_mode(mode: str) -> None:
    transcriptions_api = _FakeTranscriptionsAPI(["voice memo transcript"])
    service = SpeechToTextService(cast(Any, _FakeClient(transcriptions_api)))

    with pytest.raises(ValueError, match="Unsupported dictation mode"):
        service.transcribe_dictation(
            audio_bytes=b"audio-bytes",
            filename="recording.webm",
            content_type="audio/webm",
            mode=mode,  # type: ignore[arg-type]
        )
