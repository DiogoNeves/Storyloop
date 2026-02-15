"""Speech-to-text endpoints for Loopie and journal dictation."""

from __future__ import annotations

from functools import partial
from pathlib import Path
from typing import Annotated

import anyio
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field

from app.dependencies import get_speech_to_text_service
from app.services.speech_to_text import SpeechDictationMode, SpeechToTextService

router = APIRouter(prefix="/speech", tags=["speech"])

_AUDIO_MIME_TYPES = frozenset(
    {
        "audio/flac",
        "audio/m4a",
        "audio/mp3",
        "audio/mp4",
        "audio/mpeg",
        "audio/mpga",
        "audio/ogg",
        "audio/wav",
        "audio/webm",
        "audio/x-flac",
        "audio/x-m4a",
        "audio/x-wav",
        "video/mp4",
    }
)
_AUDIO_EXTENSIONS = frozenset(
    {
        ".flac",
        ".m4a",
        ".mp3",
        ".mp4",
        ".mpeg",
        ".mpga",
        ".ogg",
        ".wav",
        ".webm",
    }
)


class SpeechTranscriptionResponse(BaseModel):
    """Transcription payload returned to frontend callers."""

    model_config = ConfigDict(populate_by_name=True)

    text: str
    fallback_used: bool = Field(alias="fallbackUsed")


@router.post(
    "/transcriptions",
    response_model=SpeechTranscriptionResponse,
    status_code=status.HTTP_200_OK,
)
async def transcribe_audio(
    file: Annotated[UploadFile, File(...)],
    mode: Annotated[SpeechDictationMode, Form()] = "loopie",
    speech_service: SpeechToTextService = Depends(get_speech_to_text_service),
) -> SpeechTranscriptionResponse:
    """Transcribe uploaded audio and optionally format it for journal notes."""

    filename = file.filename or "recording.webm"
    content_type = _normalize_content_type(file.content_type)

    if not _is_supported_audio_upload(content_type=content_type, filename=filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unsupported audio format. Use webm, wav, mp3, m4a, "
                "ogg, mp4, mpeg/mpga, or flac."
            ),
        )

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is empty.",
        )

    transcribe = partial(
        speech_service.transcribe_dictation,
        audio_bytes=audio_bytes,
        filename=filename,
        content_type=content_type or None,
        mode=mode,
    )

    try:
        result = await anyio.to_thread.run_sync(transcribe)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return SpeechTranscriptionResponse(
        text=result.text,
        fallbackUsed=result.fallback_used,
    )


def _normalize_content_type(content_type: str | None) -> str:
    if not content_type:
        return ""
    return content_type.split(";", 1)[0].strip().lower()


def _is_supported_audio_upload(*, content_type: str, filename: str) -> bool:
    if content_type in _AUDIO_MIME_TYPES:
        return True

    suffix = Path(filename).suffix.lower()
    return suffix in _AUDIO_EXTENSIONS
