"""HTTP endpoints for YouTube OAuth authentication."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from app.dependencies import get_entry_service, get_user_service
from app.services import EntryService, UserService
from app.services.youtube_auth import (
    YoutubeAuthConfigurationError,
    YoutubeAuthError,
    YoutubeAuthService,
    YoutubeAuthStateMismatch,
)

router = APIRouter(prefix="/youtube/auth", tags=["youtube-auth"])


def get_youtube_auth_service(request: Request) -> YoutubeAuthService:
    """Extract YoutubeAuthService from application state."""
    return request.app.state.youtube_auth_service


@router.get("/start")
async def start_oauth(
    frontend_url: str = Query(
        ...,
        description="Frontend URL to redirect to after successful authentication",
    ),
    auth_service: YoutubeAuthService = Depends(get_youtube_auth_service),
    user_service: UserService = Depends(get_user_service),
):
    """Start the OAuth flow by generating an authorization URL.

    Returns the authorization URL and state token for CSRF protection.
    """
    try:
        state = auth_service.generate_state()
        user_service.save_oauth_state(state, frontend_url)
        authorization_url = auth_service.get_authorization_url(state)

        return {
            "authorization_url": authorization_url,
            "state": state,
        }
    except YoutubeAuthConfigurationError as exc:
        raise HTTPException(
            status_code=503,
            detail="YouTube OAuth is not configured. Please configure client ID and secret.",
        ) from exc
    except YoutubeAuthError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start OAuth flow: {exc}",
        ) from exc


@router.get("/callback")
async def oauth_callback(
    code: str = Query(..., description="Authorization code from Google"),
    state: str = Query(..., description="State token for CSRF protection"),
    auth_service: YoutubeAuthService = Depends(get_youtube_auth_service),
    user_service: UserService = Depends(get_user_service),
):
    """Handle OAuth callback from Google.

    Exchanges the authorization code for tokens, stores them, and redirects to frontend.
    """
    stored_state, stored_frontend_url = user_service.get_oauth_state_and_frontend_url()
    # Use stored frontend_url if available, otherwise default to localhost
    redirect_url = stored_frontend_url or "http://localhost:5173"

    try:
        access_token, refresh_token, token_expiry = (
            auth_service.exchange_code_for_tokens(code, state, stored_state)
        )

        # Fetch channel info
        channel_info = await auth_service.fetch_channel_info(
            access_token, refresh_token
        )

        # Save tokens and channel metadata
        user_service.update_tokens(access_token, refresh_token, token_expiry)
        user_service.update_channel_metadata(
            channel_info["channel_id"],
            channel_info["channel_title"],
            channel_info["channel_thumbnail_url"],
        )
        user_service.clear_oauth_state()

        # Redirect to frontend with success
        final_redirect_url = f"{redirect_url}?youtube_auth=success"
        return RedirectResponse(url=final_redirect_url)

    except YoutubeAuthStateMismatch as exc:
        raise HTTPException(
            status_code=400,
            detail="OAuth state mismatch. Please try again.",
        ) from exc
    except YoutubeAuthConfigurationError as exc:
        raise HTTPException(
            status_code=503,
            detail="YouTube OAuth is not configured.",
        ) from exc
    except YoutubeAuthError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to complete OAuth flow: {exc}",
        ) from exc


@router.get("/status")
async def get_auth_status(
    user_service: UserService = Depends(get_user_service),
):
    """Get the current OAuth linking status and channel metadata."""
    user = user_service.get_user()

    if not user or not user.access_token or not user.channel_id:
        return {
            "linked": False,
            "channel_id": None,
            "channel_title": None,
            "channel_thumbnail_url": None,
        }

    return {
        "linked": True,
        "channel_id": user.channel_id,
        "channel_title": user.channel_title,
        "channel_thumbnail_url": user.channel_thumbnail_url,
    }


@router.post("/logout")
async def logout(
    user_service: UserService = Depends(get_user_service),
):
    """Log out by clearing OAuth tokens and channel metadata.

    This removes the session but keeps the user record.
    """
    user = user_service.get_user()
    if not user:
        return {"success": True, "message": "Already logged out"}

    # Clear tokens and channel metadata but keep user record
    user_service.update_tokens("", None, None)
    user_service.update_channel_metadata("", None, None)
    user_service.clear_oauth_state()

    return {
        "success": True,
        "message": "Logged out successfully",
    }


@router.post("/delete")
async def delete_user(
    user_service: UserService = Depends(get_user_service),
    entry_service: EntryService = Depends(get_entry_service),
):
    """Delete user account and all associated data.

    This permanently removes all user data including OAuth tokens and entries.
    """
    from contextlib import closing

    user = user_service.get_user()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="No user account found",
        )

    # Delete all entries
    entries = entry_service.list_entries()
    for entry in entries:
        entry_service.delete_entry(entry.id)

    # Delete user record
    with closing(user_service._connection_factory()) as connection:
        connection.execute("DELETE FROM users WHERE id = 'default'")
        connection.commit()

    return {
        "success": True,
        "message": "User account and all data deleted successfully",
    }
