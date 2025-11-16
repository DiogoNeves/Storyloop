import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from app.services.youtube import YoutubeChannelNotFound, YoutubeService


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


@pytest.mark.asyncio
async def test_youtube_videos_endpoint_accepts_video_type_filter():
    """Test that the endpoint accepts and passes through videoType parameter."""
    channel_payload = {
        "items": [
            {
                "id": "UC666",
                "snippet": {
                    "title": "Test Channel",
                    "thumbnails": {
                        "default": {"url": "https://img.youtube.com/default.jpg"}
                    },
                },
                "contentDetails": {"relatedPlaylists": {"uploads": "UU666"}},
            }
        ]
    }
    playlist_payload = {
        "items": [
            {
                "snippet": {
                    "title": "Test video",
                    "publishedAt": "2024-02-10T08:30:00Z",
                    "resourceId": {"videoId": "test123"},
                }
            }
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/channels"):
            return httpx.Response(200, json=channel_payload)
        if request.url.path.endswith("/playlistItems"):
            return httpx.Response(200, json=playlist_payload)
        if request.url.path.endswith("/videos"):
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
            # Test with videoType parameter
            response = await client.get(
                "/youtube/videos",
                params={"channel": "@test", "videoType": "short"},
            )

    assert response.status_code == 200
    payload = response.json()
    assert payload["channelId"] == "UC666"


@pytest.mark.asyncio
async def test_get_video_detail_returns_video_with_transcript_none():
    video_id = "vid001"
    video_payload = {
        "items": [
            {
                "id": video_id,
                "snippet": {
                    "title": "Sample Video",
                    "description": "A detailed walkthrough",
                    "publishedAt": "2024-05-01T12:00:00Z",
                    "thumbnails": {
                        "high": {
                            "url": "https://img.youtube.com/vi/vid001/hqdefault.jpg"
                        }
                    },
                },
                "contentDetails": {"duration": "PT4M20S"},
                "status": {"privacyStatus": "public"},
            }
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/videos"):
            params = request.url.params
            assert params.get("id") == video_id
            assert "contentDetails,snippet,status" in params.get("part", "")
            return httpx.Response(200, json=video_payload)
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
            response = await client.get(f"/youtube/videos/{video_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "id": "vid001",
        "title": "Sample Video",
        "description": "A detailed walkthrough",
        "publishedAt": "2024-05-01T12:00:00+00:00",
        "url": "https://www.youtube.com/watch?v=vid001",
        "thumbnailUrl": "https://img.youtube.com/vi/vid001/hqdefault.jpg",
        "videoType": "video",
        "privacyStatus": "public",
        "transcript": None,
    }


@pytest.mark.asyncio
async def test_get_video_detail_converts_youtube_error():
    class FailingYoutubeService:
        async def fetch_video_detail(self, *args, **kwargs):
            raise YoutubeChannelNotFound("Channel missing")

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
            app.state.youtube_service = FailingYoutubeService()
            response = await client.get("/youtube/videos/unknown")

    assert response.status_code == 404
    assert response.json() == {"detail": "Channel missing"}
