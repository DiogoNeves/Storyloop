"""Health check endpoints."""

from fastapi import APIRouter

router = APIRouter()


@router.get("", summary="Health check")
@router.get("/", include_in_schema=False)
async def read_health() -> dict[str, str]:
    """Return a simple readiness message."""
    return {"status": "Storyloop API ready"}
