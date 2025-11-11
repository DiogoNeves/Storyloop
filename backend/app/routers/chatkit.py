"""HTTP endpoints for ChatKit session management."""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.dependencies import get_user_service
from app.services.users import UserRecord, UserService

router = APIRouter(prefix="/chatkit", tags=["chatkit"])


def _serialize_user_metadata(record: UserRecord | None) -> dict[str, Any]:
    """Convert the active user record to a metadata dictionary."""

    if record is None:
        return {}

    metadata: dict[str, Any] = {"userId": record.id}
    optional_fields: dict[str, Any] = {
        "channelId": record.channel_id,
        "channelTitle": record.channel_title,
        "channelUrl": record.channel_url,
        "channelThumbnailUrl": record.channel_thumbnail_url,
    }
    metadata.update({key: value for key, value in optional_fields.items() if value})

    if record.channel_updated_at:
        metadata["channelUpdatedAt"] = record.channel_updated_at.isoformat()
    if record.credentials_updated_at:
        metadata["credentialsUpdatedAt"] = record.credentials_updated_at.isoformat()

    return metadata


@router.post("/session")
async def create_chatkit_session(
    request: Request,
    user_service: UserService = Depends(get_user_service),
) -> dict[str, Any]:
    """Create a ChatKit session for the current Storyloop user."""

    settings = request.app.state.settings
    if not settings.openai_api_key or not settings.chatkit_workflow_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ChatKit is not configured.",
        )

    user_metadata = _serialize_user_metadata(user_service.get_active_user())
    url = f"{settings.chatkit_api_base.rstrip('/')}/chatkit/sessions"
    payload: dict[str, Any] = {"workflow_id": settings.chatkit_workflow_id}
    if user_metadata:
        payload["metadata"] = user_metadata

    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "OpenAI-Beta": "chatkit_beta=v1",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:  # pragma: no cover - network failure path
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to contact ChatKit API.",
        ) from exc

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="ChatKit session creation failed.",
        )

    data = response.json()
    client_secret = data.get("client_secret")
    expires_after = data.get("expires_after")
    if not client_secret or not expires_after:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="ChatKit API returned an unexpected payload.",
        )

    return {"clientSecret": client_secret, "expiresAfter": expires_after}


__all__ = ["router"]
