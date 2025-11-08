"""Tests for YouTube account service."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.services.youtube import YoutubeConfigurationError
from app.services.youtube_account import YoutubeAccountService


class FakeChannelsList:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def execute(self) -> dict[str, Any]:
        return self._payload


class FakeChannelsResource:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def list(self, **kwargs: Any) -> FakeChannelsList:
        return FakeChannelsList(self._payload)


class FakePlaylistItemsList:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def execute(self) -> dict[str, Any]:
        return self._payload


class FakePlaylistItemsResource:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def list(self, **kwargs: Any) -> FakePlaylistItemsList:
        return FakePlaylistItemsList(self._payload)


class FakeVideosList:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def execute(self) -> dict[str, Any]:
        return self._payload


class FakeVideosResource:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def list(self, **kwargs: Any) -> FakeVideosList:
        return FakeVideosList(self._payload)


class FakeYoutubeClient:
    def __init__(
        self,
        *,
        channel_payload: dict[str, Any] | None = None,
        playlist_payload: dict[str, Any] | None = None,
        videos_payload: dict[str, Any] | None = None,
    ) -> None:
        self._channel_payload = channel_payload or {}
        self._playlist_payload = playlist_payload or {}
        self._videos_payload = videos_payload or {}

    def channels(self) -> FakeChannelsResource:
        return FakeChannelsResource(self._channel_payload)

    def playlistItems(self) -> FakePlaylistItemsResource:
        return FakePlaylistItemsResource(self._playlist_payload)

    def videos(self) -> FakeVideosResource:
        return FakeVideosResource(self._videos_payload)


@pytest.fixture()
def mock_user_service() -> Any:
    """Create a mock UserService."""
    service = MagicMock()
    record = MagicMock()
    record.credentials_json = '{"token": "abc"}'
    record.channel_id = None
    record.channel_title = None
    record.channel_url = None
    record.channel_thumbnail_url = None
    record.channel_updated_at = None
    service.get_active_user.return_value = record
    return service


@pytest.fixture()
def mock_youtube_service() -> Any:
    """Create a mock YoutubeService."""
    service = MagicMock()
    return service


@pytest.fixture()
def mock_oauth_service() -> Any:
    """Create a mock YoutubeOAuthService."""
    service = MagicMock()
    return service


def test_fetch_and_persist_channel_info_success(
    mock_user_service: Any,
    mock_youtube_service: Any,
    mock_oauth_service: Any,
) -> None:
    """Test successful channel info fetch and persistence."""
    channel_payload = {
        "items": [
            {
                "id": "UC123",
                "snippet": {
                    "title": "Test Channel",
                    "customUrl": "@testchannel",
                    "thumbnails": {
                        "high": {"url": "https://example.com/thumb.jpg"},
                    },
                    "publishedAt": "2024-01-01T00:00:00Z",
                },
            }
        ]
    }

    fake_client = FakeYoutubeClient(channel_payload=channel_payload)
    mock_youtube_service.build_authenticated_client.return_value = fake_client

    service = YoutubeAccountService(
        user_service=mock_user_service,
        youtube_service=mock_youtube_service,
        oauth_service=mock_oauth_service,
    )

    result = service.fetch_and_persist_channel_info()

    assert result is not None
    assert result["channel_id"] == "UC123"
    assert result["channel_title"] == "Test Channel"
    assert result["channel_url"] == "https://www.youtube.com/@testchannel"
    mock_user_service.update_channel_info.assert_called_once()


def test_fetch_and_persist_channel_info_no_channel(
    mock_user_service: Any,
    mock_youtube_service: Any,
    mock_oauth_service: Any,
) -> None:
    """Test handling when no channel is found."""
    channel_payload = {"items": []}

    fake_client = FakeYoutubeClient(channel_payload=channel_payload)
    mock_youtube_service.build_authenticated_client.return_value = fake_client

    service = YoutubeAccountService(
        user_service=mock_user_service,
        youtube_service=mock_youtube_service,
        oauth_service=mock_oauth_service,
    )

    result = service.fetch_and_persist_channel_info()
    assert result is None
    mock_user_service.update_channel_info.assert_not_called()


def test_fetch_channel_videos_success(
    mock_user_service: Any,
    mock_youtube_service: Any,
    mock_oauth_service: Any,
) -> None:
    """Test successful video fetch."""
    channel_payload = {
        "items": [
            {
                "contentDetails": {
                    "relatedPlaylists": {"uploads": "UU123"},
                }
            }
        ]
    }

    playlist_payload = {
        "items": [
            {
                "snippet": {
                    "title": "Video 1",
                    "description": "Description",
                    "publishedAt": "2024-01-01T12:00:00Z",
                    "resourceId": {"videoId": "vid1"},
                    "thumbnails": {
                        "medium": {"url": "https://example.com/thumb1.jpg"}
                    },
                    "liveBroadcastContent": "none",
                },
                "contentDetails": {},
            }
        ]
    }

    videos_payload = {
        "items": [
            {
                "id": "vid1",
                "contentDetails": {"duration": "PT300S"},
                "snippet": {
                    "title": "Video 1",
                    "description": "Description",
                    "publishedAt": "2024-01-01T12:00:00Z",
                    "thumbnails": {
                        "medium": {"url": "https://example.com/thumb1.jpg"}
                    },
                    "liveBroadcastContent": "none",
                },
            }
        ]
    }

    fake_client = FakeYoutubeClient(
        channel_payload=channel_payload,
        playlist_payload=playlist_payload,
        videos_payload=videos_payload,
    )
    mock_youtube_service.build_authenticated_client.return_value = fake_client

    service = YoutubeAccountService(
        user_service=mock_user_service,
        youtube_service=mock_youtube_service,
        oauth_service=mock_oauth_service,
    )

    videos = service.fetch_channel_videos(max_results=10)

    assert len(videos) == 1
    assert videos[0].id == "vid1"
    assert videos[0].title == "Video 1"
    assert videos[0].video_type == "video"


def test_fetch_channel_videos_no_uploads_playlist(
    mock_user_service: Any,
    mock_youtube_service: Any,
    mock_oauth_service: Any,
) -> None:
    """Test handling when uploads playlist is missing."""
    channel_payload = {
        "items": [
            {
                "contentDetails": {
                    "relatedPlaylists": {},
                }
            }
        ]
    }

    fake_client = FakeYoutubeClient(channel_payload=channel_payload)
    mock_youtube_service.build_authenticated_client.return_value = fake_client

    service = YoutubeAccountService(
        user_service=mock_user_service,
        youtube_service=mock_youtube_service,
        oauth_service=mock_oauth_service,
    )

    videos = service.fetch_channel_videos()
    assert videos == []


def test_fetch_channel_videos_classifies_shorts(
    mock_user_service: Any,
    mock_youtube_service: Any,
    mock_oauth_service: Any,
) -> None:
    """Test that videos are correctly classified as shorts."""
    channel_payload = {
        "items": [
            {
                "contentDetails": {
                    "relatedPlaylists": {"uploads": "UU123"},
                }
            }
        ]
    }

    playlist_payload = {
        "items": [
            {
                "snippet": {
                    "title": "Short Video",
                    "description": "A short",
                    "publishedAt": "2024-01-01T12:00:00Z",
                    "resourceId": {"videoId": "short1"},
                    "thumbnails": {
                        "medium": {"url": "https://example.com/thumb.jpg"}
                    },
                    "liveBroadcastContent": "none",
                },
                "contentDetails": {},
            }
        ]
    }

    videos_payload = {
        "items": [
            {
                "id": "short1",
                "contentDetails": {"duration": "PT60S"},  # 60 seconds = short
                "snippet": {
                    "title": "Short Video",
                    "description": "A short",
                    "publishedAt": "2024-01-01T12:00:00Z",
                    "thumbnails": {
                        "medium": {"url": "https://example.com/thumb.jpg"}
                    },
                    "liveBroadcastContent": "none",
                },
            }
        ]
    }

    fake_client = FakeYoutubeClient(
        channel_payload=channel_payload,
        playlist_payload=playlist_payload,
        videos_payload=videos_payload,
    )
    mock_youtube_service.build_authenticated_client.return_value = fake_client

    service = YoutubeAccountService(
        user_service=mock_user_service,
        youtube_service=mock_youtube_service,
        oauth_service=mock_oauth_service,
    )

    videos = service.fetch_channel_videos()
    assert len(videos) == 1
    assert videos[0].video_type == "short"

