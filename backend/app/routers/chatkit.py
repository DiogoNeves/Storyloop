"""Routes for creating ChatKit client sessions."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAIError
from pydantic import BaseModel, ConfigDict, Field

from app.dependencies import get_chatkit_service, get_user_service
from app.services.chatkit import ChatKitService
from app.services.users import UserService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chatkit", tags=["chatkit"])


class ChatKitSessionRequest(BaseModel):
    """Request payload for starting a ChatKit session."""

    model_config = ConfigDict(populate_by_name=True)

    enable_file_uploads: bool | None = Field(
        default=None,
        alias="enableFileUploads",
        description="Override file upload support for the new session.",
    )


class ChatKitSessionResponse(BaseModel):
    """Response payload containing the ChatKit client secret."""

    model_config = ConfigDict(populate_by_name=True)

    client_secret: str = Field(alias="clientSecret")
    session_id: str = Field(alias="sessionId")
    expires_at: datetime = Field(alias="expiresAt")


@router.post("/session", response_model=ChatKitSessionResponse)
def create_chatkit_session(
    request: ChatKitSessionRequest | None = None,
    chatkit_service: ChatKitService = Depends(get_chatkit_service),
    user_service: UserService = Depends(get_user_service),
) -> ChatKitSessionResponse:
    """Create a ChatKit session and return the ephemeral client secret."""

    record = user_service.get_active_user()
    user_id = record.id if record else "storyloop-anonymous"
    try:
        session = chatkit_service.create_session(
            user_id=user_id,
            enable_file_uploads=request.enable_file_uploads if request else None,
        )
    except OpenAIError as exc:  # pragma: no cover - network interaction
        logger.error("Failed to create ChatKit session", exc_info=exc)
        raise HTTPException(status_code=502, detail="Failed to create ChatKit session")

    expires_at = datetime.fromtimestamp(session.expires_at, tz=UTC)
    logger.info(
        "Created ChatKit session",
        extra={
            "session_id": session.id,
            "workflow_id": chatkit_service.workflow_id,
            "user_id": user_id,
        },
    )
    return ChatKitSessionResponse(
        clientSecret=session.client_secret,
        sessionId=session.id,
        expiresAt=expires_at,
    )


__all__ = ["router"]
