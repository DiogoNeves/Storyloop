import httpx
import pytest

from app.services.youtube import (
    YoutubeChannelNotFound,
    YoutubeConfigurationError,
    YoutubeService,
)


@pytest.mark.asyncio
async def test_fetch_channel_videos_returns_feed():
    channel_payload = {
        "items": [
            {
                "id": "UC123",
                "snippet": {
                    "title": "Storyloop",
                    "description": "Channel description",
                    "thumbnails": {
                        "default": {"url": "https://img.youtube.com/default.jpg"},
                        "medium": {"url": "https://img.youtube.com/medium.jpg"},
                    },
                },
                "contentDetails": {
                    "relatedPlaylists": {
                        "uploads": "UU123",
                    }
                },
            }
        ]
    }
    playlist_payload = {
        "items": [
            {
                "snippet": {
                    "title": "First video",
                    "description": "A behind the scenes look",
                    "publishedAt": "2024-01-01T12:00:00Z",
                    "resourceId": {"videoId": "vid-1"},
                    "thumbnails": {
                        "medium": {"url": "https://img.youtube.com/vid-1/mqdefault.jpg"}
                    },
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
        if request.url.path.endswith("/search"):
            return httpx.Response(200, json={"items": []})
        raise AssertionError(f"Unhandled URL {request.url}")

    service = YoutubeService(api_key="test-key", transport=httpx.MockTransport(handler))

    feed = await service.fetch_channel_videos("@storyloop", max_results=5)

    assert feed.channel_id == "UC123"
    assert feed.channel_title == "Storyloop"
    assert feed.channel_thumbnail_url == "https://img.youtube.com/medium.jpg"
    assert len(feed.videos) == 1
    video = feed.videos[0]
    assert video.id == "vid-1"
    assert video.url == "https://www.youtube.com/watch?v=vid-1"
    assert video.thumbnail_url == "https://img.youtube.com/vid-1/mqdefault.jpg"


@pytest.mark.asyncio
async def test_fetch_channel_videos_requires_api_key():
    service = YoutubeService(api_key=None)
    with pytest.raises(YoutubeConfigurationError):
        await service.fetch_channel_videos("@storyloop")


@pytest.mark.asyncio
async def test_fetch_channel_videos_handles_missing_channel():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/channels"):
            return httpx.Response(200, json={"items": []})
        if request.url.path.endswith("/search"):
            return httpx.Response(200, json={"items": []})
        if request.url.path.endswith("/playlistItems"):
            return httpx.Response(200, json={"items": []})
        raise AssertionError(f"Unhandled URL {request.url}")

    service = YoutubeService(api_key="test-key", transport=httpx.MockTransport(handler))

    with pytest.raises(YoutubeChannelNotFound):
        await service.fetch_channel_videos("https://youtube.com/channel/UC123")
