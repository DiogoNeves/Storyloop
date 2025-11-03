import httpx
import pytest

from app.services.youtube import (
    YoutubeAPIRequestError,
    YoutubeChannelNotFound,
    YoutubeConfigurationError,
    YoutubeService,
    YoutubeVideoStatistics,
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
        if request.url.path.endswith("/videos"):
            # Video duration lookup
            return httpx.Response(200, json={"items": []})
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


@pytest.mark.asyncio
async def test_fetch_channel_videos_resolves_watch_url_via_video_lookup():
    video_payload = {
        "items": [
            {
                "id": "vid-1",
                "snippet": {
                    "channelId": "UC123",
                },
            }
        ]
    }
    channel_payload = {
        "items": [
            {
                "id": "UC123",
                "snippet": {
                    "title": "Storyloop",
                    "description": "Channel description",
                    "thumbnails": {
                        "default": {"url": "https://img.youtube.com/default.jpg"},
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
                }
            }
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/videos"):
            assert request.url.params.get("id") == "vid-1"
            return httpx.Response(200, json=video_payload)
        if request.url.path.endswith("/channels"):
            params = request.url.params
            if params.get("id") == "UC123":
                return httpx.Response(200, json=channel_payload)
            return httpx.Response(200, json={"items": []})
        if request.url.path.endswith("/playlistItems"):
            return httpx.Response(200, json=playlist_payload)
        if request.url.path.endswith("/search"):
            return httpx.Response(200, json={"items": []})
        raise AssertionError(f"Unhandled URL {request.url}")

    service = YoutubeService(api_key="test-key", transport=httpx.MockTransport(handler))

    feed = await service.fetch_channel_videos(
        "https://www.youtube.com/watch?v=vid-1", max_results=1
    )

    assert feed.channel_id == "UC123"
    assert feed.videos[0].id == "vid-1"


@pytest.mark.asyncio
async def test_fetch_channel_videos_skips_playlist_when_max_results_is_zero():
    channel_payload = {
        "items": [
            {
                "id": "UC999",
                "snippet": {
                    "title": "Storyloop",
                    "thumbnails": {
                        "default": {"url": "https://img.youtube.com/default.jpg"},
                    },
                },
                "contentDetails": {"relatedPlaylists": {"uploads": "UU999"}},
            }
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/channels"):
            return httpx.Response(200, json=channel_payload)
        if request.url.path.endswith("/playlistItems"):
            raise AssertionError("Playlist endpoint should not be called")
        if request.url.path.endswith("/search"):
            return httpx.Response(200, json={"items": []})
        raise AssertionError(f"Unhandled URL {request.url}")

    service = YoutubeService(api_key="test-key", transport=httpx.MockTransport(handler))

    feed = await service.fetch_channel_videos("@storyloop", max_results=0)

    assert feed.channel_id == "UC999"
    assert feed.videos == []


@pytest.mark.asyncio
async def test_fetch_channel_videos_paginates_playlist_items():
    channel_payload = {
        "items": [
            {
                "id": "UC222",
                "snippet": {
                    "title": "Storyloop",
                    "thumbnails": {
                        "default": {"url": "https://img.youtube.com/default.jpg"},
                    },
                },
                "contentDetails": {"relatedPlaylists": {"uploads": "UU222"}},
            }
        ]
    }
    playlist_pages = {
        None: {
            "items": [
                {
                    "snippet": {
                        "title": "First video",
                        "description": "",
                        "publishedAt": "2024-01-01T12:00:00Z",
                        "resourceId": {"videoId": "vid-1"},
                    }
                },
                {
                    "snippet": {
                        "title": "Second video",
                        "description": "",
                        "publishedAt": "2024-01-02T12:00:00Z",
                        "resourceId": {"videoId": "vid-2"},
                    }
                },
            ],
            "nextPageToken": "token-2",
        },
        "token-2": {
            "items": [
                {
                    "snippet": {
                        "title": "Third video",
                        "description": "",
                        "publishedAt": "2024-01-03T12:00:00Z",
                        "resourceId": {"videoId": "vid-3"},
                    }
                },
                {
                    "snippet": {
                        "title": "Fourth video",
                        "description": "",
                        "publishedAt": "2024-01-04T12:00:00Z",
                        "resourceId": {"videoId": "vid-4"},
                    }
                },
            ]
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/channels"):
            return httpx.Response(200, json=channel_payload)
        if request.url.path.endswith("/playlistItems"):
            token = request.url.params.get("pageToken")
            return httpx.Response(200, json=playlist_pages[token])
        if request.url.path.endswith("/videos"):
            # Video duration lookup
            return httpx.Response(200, json={"items": []})
        if request.url.path.endswith("/search"):
            return httpx.Response(200, json={"items": []})
        raise AssertionError(f"Unhandled URL {request.url}")

    service = YoutubeService(api_key="test-key", transport=httpx.MockTransport(handler))

    feed = await service.fetch_channel_videos("@storyloop", max_results=3)

    ids = [video.id for video in feed.videos]
    assert ids == ["vid-1", "vid-2", "vid-3"]


@pytest.mark.asyncio
async def test_fetch_channel_videos_raises_for_malformed_json():
    channel_payload = {
        "items": [
            {
                "id": "UC111",
                "snippet": {
                    "title": "Storyloop",
                    "thumbnails": {
                        "default": {"url": "https://img.youtube.com/default.jpg"},
                    },
                },
                "contentDetails": {"relatedPlaylists": {"uploads": "UU111"}},
            }
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/channels"):
            return httpx.Response(200, json=channel_payload)
        if request.url.path.endswith("/playlistItems"):
            return httpx.Response(
                200,
                content=b"not-json",
                headers={"content-type": "application/json"},
            )
        if request.url.path.endswith("/search"):
            return httpx.Response(200, json={"items": []})
        raise AssertionError(f"Unhandled URL {request.url}")

    service = YoutubeService(api_key="test-key", transport=httpx.MockTransport(handler))

    with pytest.raises(YoutubeAPIRequestError):
        await service.fetch_channel_videos("@storyloop", max_results=5)


def test_video_statistics_requires_string_identifier():
    """Standalone scorecard script validates ID shape; ensure backend matches."""

    item_without_id = {
        "statistics": {"viewCount": "10", "likeCount": "1", "commentCount": "0"}
    }
    missing_id_result = YoutubeVideoStatistics.from_api_item(item_without_id)
    assert missing_id_result == (None, None)

    item_with_non_string_id = {
        "id": 123,
        "statistics": {"viewCount": "10", "likeCount": "1", "commentCount": "0"},
    }
    non_string_result = YoutubeVideoStatistics.from_api_item(item_with_non_string_id)
    assert non_string_result == (None, None)


def test_video_statistics_allows_missing_statistics():
    item = {"id": "vid-1"}

    video_id, stats = YoutubeVideoStatistics.from_api_item(item)

    assert video_id == "vid-1"
    assert stats is None
