import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from app.services.youtube import YoutubeService


@pytest.mark.asyncio
async def test_youtube_videos_endpoint_returns_payload():
    channel_payload = {
        "items": [
            {
                "id": "UC555",
                "snippet": {
                    "title": "Example Channel",
                    "description": "Sample description",
                    "thumbnails": {
                        "default": {
                            "url": "https://img.youtube.com/default.jpg"
                        }
                    },
                },
                "contentDetails": {"relatedPlaylists": {"uploads": "UU555"}},
            }
        ]
    }
    playlist_payload = {
        "items": [
            {
                "snippet": {
                    "title": "Latest upload",
                    "description": "Episode overview",
                    "publishedAt": "2024-02-10T08:30:00Z",
                    "resourceId": {"videoId": "abc123"},
                }
            }
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/channels"):
            params = request.url.params
            if params.get("forHandle") == "storyloop":
                return httpx.Response(200, json=channel_payload)
            return httpx.Response(200, json={"items": []})
        if request.url.path.endswith("/playlistItems"):
            return httpx.Response(200, json=playlist_payload)
        if request.url.path.endswith("/videos"):
            # Video duration lookup
            return httpx.Response(200, json={"items": []})
        if request.url.path.endswith("/search"):
            return httpx.Response(200, json={"items": []})
        raise AssertionError(f"Unhandled URL {request.url}")

    test_transport = httpx.MockTransport(handler)

    settings = Settings(
        YOUTUBE_API_KEY="test-key",
        DATABASE_URL="sqlite:///:memory:",
        YOUTUBE_OAUTH_CLIENT_ID="client-id",
        YOUTUBE_OAUTH_CLIENT_SECRET="client-secret",
        YOUTUBE_REDIRECT_URI="http://localhost:8000/youtube/auth/callback",
    )
    app = create_app(settings)

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            app.state.youtube_service = YoutubeService(
                api_key="test-key", transport=test_transport
            )
            response = await client.get(
                "/youtube/videos", params={"channel": "@storyloop"}
            )

    assert response.status_code == 200
    payload = response.json()
    assert payload["channelId"] == "UC555"
    assert payload["channelTitle"] == "Example Channel"
    assert payload["videos"][0]["id"] == "abc123"
