"""Integration tests for speech transcription endpoints."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.speech import router as speech_router


@dataclass
class _FakeSpeechResult:
    text: str
    fallback_used: bool


class _FakeSpeechService:
    def __init__(self, result: _FakeSpeechResult | None = None) -> None:
        self.result = result or _FakeSpeechResult(
            text="transcribed text",
            fallback_used=False,
        )

    def transcribe_dictation(
        self,
        *,
        audio_bytes: bytes,
        filename: str,
        content_type: str | None,
        mode: str,
    ) -> _FakeSpeechResult:
        assert audio_bytes == b"audio-bytes"
        assert filename == "clip.webm"
        assert content_type == "audio/webm"
        assert mode in {"loopie", "journal_note"}
        return self.result


def _create_app(*, service: _FakeSpeechService | None) -> FastAPI:
    app = FastAPI()
    if service is not None:
        app.state.speech_to_text_service = service
    app.include_router(speech_router)
    return app


def test_transcribe_audio_returns_success_payload() -> None:
    app = _create_app(service=_FakeSpeechService())
    client = TestClient(app)

    response = client.post(
        "/speech/transcriptions",
        data={"mode": "loopie"},
        files={"file": ("clip.webm", b"audio-bytes", "audio/webm")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "text": "transcribed text",
        "fallbackUsed": False,
    }


def test_transcribe_audio_supports_journal_note_mode() -> None:
    app = _create_app(
        service=_FakeSpeechService(
            _FakeSpeechResult(text="formatted body", fallback_used=True)
        )
    )
    client = TestClient(app)

    response = client.post(
        "/speech/transcriptions",
        data={"mode": "journal_note"},
        files={"file": ("clip.webm", b"audio-bytes", "audio/webm")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "text": "formatted body",
        "fallbackUsed": True,
    }


def test_transcribe_audio_rejects_unsupported_file_type() -> None:
    app = _create_app(service=_FakeSpeechService())
    client = TestClient(app)

    response = client.post(
        "/speech/transcriptions",
        files={"file": ("clip.txt", b"audio-bytes", "text/plain")},
    )

    assert response.status_code == 400
    assert "Unsupported audio format" in response.json()["detail"]


def test_transcribe_audio_requires_service_configuration() -> None:
    app = _create_app(service=None)
    client = TestClient(app)

    response = client.post(
        "/speech/transcriptions",
        files={"file": ("clip.webm", b"audio-bytes", "audio/webm")},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Speech-to-text service is not configured"
