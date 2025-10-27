"""API routers exposed by the Storyloop application."""

from fastapi import APIRouter

from .entries import router as entries_router
from .health import router as health_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="/health", tags=["health"])
api_router.include_router(entries_router, prefix="/entries", tags=["entries"])

__all__ = ["api_router"]
