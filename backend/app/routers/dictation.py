"""Dictation endpoints for audio transcription and title generation."""

from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.dependencies import get_dictation_service
from app.services.dictation import DictationService

router = APIRouter(prefix="/dictation", tags=["dictation"])


class DictationTranscriptResponse(BaseModel):
    """Response payload for transcription."""

    text: str


class DictationTitleRequest(BaseModel):
    """Request payload for title generation."""

    text: str = Field(min_length=1)


class DictationTitleResponse(BaseModel):
    """Response payload for title generation."""

    title: str


@router.post("/transcribe", response_model=DictationTranscriptResponse)
async def transcribe_dictation(
    file: Annotated[UploadFile, File(...)],
    dictation_service: DictationService = Depends(get_dictation_service),
) -> DictationTranscriptResponse:
    """Transcribe an uploaded audio file."""
    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("audio/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only audio files are supported.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file is empty.",
        )

    try:
        text = await dictation_service.transcribe_audio(
            filename=file.filename or "dictation.webm",
            content_type=content_type,
            data=data,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Transcription failed. Please try again.",
        ) from exc

    return DictationTranscriptResponse(text=text)


@router.post("/title", response_model=DictationTitleResponse)
async def generate_dictation_title(
    payload: DictationTitleRequest,
    dictation_service: DictationService = Depends(get_dictation_service),
) -> DictationTitleResponse:
    """Generate a title from the dictation text."""
    body_text = payload.text.strip()
    if not body_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Body text is required to generate a title.",
        )

    try:
        title = await dictation_service.generate_title(text=body_text)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Title generation failed. Please try again.",
        ) from exc

    return DictationTitleResponse(title=title)
