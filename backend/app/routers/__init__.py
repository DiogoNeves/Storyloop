"""API routers exposed by the Storyloop application."""

from fastapi import APIRouter

from app.routers.entries import router as entries_router
from app.routers.health import router as health_router
from app.routers.youtube import router as youtube_router
from app.routers.youtube_auth import router as youtube_auth_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="/health", tags=["health"])
api_router.include_router(entries_router)
api_router.include_router(youtube_router)
api_router.include_router(youtube_auth_router)

__all__ = ["api_router"]
