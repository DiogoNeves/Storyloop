"""Route guard dependencies for common access control patterns."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.dependencies import get_youtube_demo_mode


def require_non_demo(
    demo_mode: bool = Depends(get_youtube_demo_mode),
) -> None:
    """Dependency that raises 403 if the app is running in demo mode.

    Use this guard for endpoints that should be disabled in demo mode,
    such as asset uploads or data modifications.

    Usage:
        @router.post("/upload")
        async def upload_asset(
            _: None = Depends(require_non_demo),
            asset_service: AssetService = Depends(get_asset_service),
        ):
            ...
    """
    if demo_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This operation is disabled in demo mode.",
        )


__all__ = ["require_non_demo"]
