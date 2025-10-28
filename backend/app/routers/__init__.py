"""API routers exposed by the Storyloop application."""

from fastapi import APIRouter

from .health import router as health_router
from .youtube import router as youtube_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="/health", tags=["health"])
api_router.include_router(youtube_router, prefix="/youtube", tags=["youtube"])

__all__ = ["api_router"]
