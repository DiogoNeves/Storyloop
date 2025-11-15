"""Health check endpoints."""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("", summary="Health check")
@router.get("/", include_in_schema=False)
async def read_health(request: Request) -> dict[str, bool | str]:
    """Return service readiness details for the frontend."""

    youtube_demo_mode = getattr(request.app.state, "youtube_demo_mode", False)
    assistant_agent = getattr(request.app.state, "assistant_agent", None)
    agent_available = assistant_agent is not None

    return {
        "status": "Storyloop API ready",
        "youtubeDemoMode": youtube_demo_mode,
        "agentAvailable": agent_available,
    }
