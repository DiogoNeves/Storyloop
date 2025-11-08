"""Tests for YouTube video classification utilities."""

from __future__ import annotations

import pytest

from app.utils.youtube_video import (
    choose_thumbnail,
    classify_video_type,
    extract_channel_fields,
)


class TestChooseThumbnail:
    """Tests for thumbnail selection helper."""

    def test_returns_preferred_thumbnail_when_available(self):
        thumbnails = {
            "default": {"url": "https://example.com/default.jpg"},
            "medium": {"url": "https://example.com/medium.jpg"},
            "high": {"url": "https://example.com/high.jpg"},
        }
        result = choose_thumbnail(thumbnails, ("high", "medium", "default"))
        assert result == "https://example.com/high.jpg"

    def test_falls_back_to_next_preference(self):
        thumbnails = {
            "default": {"url": "https://example.com/default.jpg"},
            "medium": {"url": "https://example.com/medium.jpg"},
        }
        result = choose_thumbnail(thumbnails, ("high", "medium", "default"))
        assert result == "https://example.com/medium.jpg"

    def test_returns_none_for_invalid_input(self):
        assert choose_thumbnail(None) is None
        assert choose_thumbnail({}) is None
        assert choose_thumbnail({"invalid": "value"}) is None

    def test_handles_missing_url_field(self):
        thumbnails = {"high": {"not_url": "value"}}
        assert choose_thumbnail(thumbnails) is None


class TestClassifyVideoType:
    """Tests for video type classification."""

    def test_classifies_live_broadcast(self):
        result = classify_video_type(
            content_details=None,
            file_details=None,
            live_broadcast_content="live",
        )
        assert result == "live"

    def test_classifies_upcoming_broadcast(self):
        result = classify_video_type(
            content_details=None,
            file_details=None,
            live_broadcast_content="upcoming",
        )
        assert result == "live"

    def test_classifies_short_by_duration(self):
        content_details = {"duration": "PT60S"}  # 60 seconds
        result = classify_video_type(
            content_details=content_details,
            file_details=None,
            live_broadcast_content="none",
        )
        assert result == "short"

    def test_classifies_short_by_duration_threshold(self):
        content_details = {"duration": "PT180S"}  # Exactly 180 seconds
        result = classify_video_type(
            content_details=content_details,
            file_details=None,
            live_broadcast_content="none",
        )
        assert result == "short"

    def test_classifies_long_form_by_duration(self):
        content_details = {"duration": "PT181S"}  # 181 seconds
        result = classify_video_type(
            content_details=content_details,
            file_details=None,
            live_broadcast_content="none",
        )
        assert result == "video"

    def test_classifies_short_by_aspect_ratio_vertical(self):
        file_details = {
            "videoStreams": [
                {"widthPixels": 1080, "heightPixels": 1920}  # Vertical
            ]
        }
        result = classify_video_type(
            content_details=None,
            file_details=file_details,
            live_broadcast_content="none",
        )
        assert result == "short"

    def test_classifies_short_by_aspect_ratio_square(self):
        file_details = {
            "videoStreams": [
                {"widthPixels": 1080, "heightPixels": 1080}  # Square
            ]
        }
        result = classify_video_type(
            content_details=None,
            file_details=file_details,
            live_broadcast_content="none",
        )
        assert result == "short"

    def test_classifies_video_by_aspect_ratio_horizontal(self):
        file_details = {
            "videoStreams": [
                {"widthPixels": 1920, "heightPixels": 1080}  # Horizontal
            ]
        }
        result = classify_video_type(
            content_details=None,
            file_details=file_details,
            live_broadcast_content="none",
        )
        assert result == "video"

    def test_prefers_live_over_duration(self):
        content_details = {"duration": "PT60S"}  # Would be short
        result = classify_video_type(
            content_details=content_details,
            file_details=None,
            live_broadcast_content="live",
        )
        assert result == "live"

    def test_prefers_duration_over_aspect_ratio(self):
        content_details = {"duration": "PT60S"}  # Short by duration
        file_details = {
            "videoStreams": [
                {"widthPixels": 1920, "heightPixels": 1080}  # Horizontal
            ]
        }
        result = classify_video_type(
            content_details=content_details,
            file_details=file_details,
            live_broadcast_content="none",
        )
        assert result == "short"

    def test_defaults_to_video_when_no_indicators(self):
        result = classify_video_type(
            content_details=None,
            file_details=None,
            live_broadcast_content="none",
        )
        assert result == "video"

    def test_handles_missing_file_details(self):
        content_details = {"duration": "PT300S"}  # Long form
        result = classify_video_type(
            content_details=content_details,
            file_details=None,
            live_broadcast_content="none",
        )
        assert result == "video"

    def test_handles_empty_video_streams(self):
        file_details = {"videoStreams": []}
        result = classify_video_type(
            content_details=None,
            file_details=file_details,
            live_broadcast_content="none",
        )
        assert result == "video"

    def test_handles_missing_dimensions(self):
        file_details = {"videoStreams": [{}]}
        result = classify_video_type(
            content_details=None,
            file_details=file_details,
            live_broadcast_content="none",
        )
        assert result == "video"


class TestExtractChannelFields:
    """Tests for channel field extraction."""

    def test_extracts_all_fields(self):
        channel_item = {
            "id": "UC1234567890",
            "snippet": {
                "title": "Test Channel",
                "customUrl": "@testchannel",
                "thumbnails": {
                    "high": {"url": "https://example.com/thumb.jpg"},
                },
                "publishedAt": "2024-01-01T00:00:00Z",
            },
        }
        result = extract_channel_fields(channel_item)
        assert result is not None
        assert result["channel_id"] == "UC1234567890"
        assert result["channel_title"] == "Test Channel"
        assert result["channel_url"] == "https://www.youtube.com/@testchannel"
        assert result["channel_thumbnail_url"] == "https://example.com/thumb.jpg"
        assert result["channel_updated_at"] is not None

    def test_falls_back_to_channel_id_url(self):
        channel_item = {
            "id": "UC1234567890",
            "snippet": {
                "title": "Test Channel",
            },
        }
        result = extract_channel_fields(channel_item)
        assert result is not None
        assert result["channel_url"] == "https://www.youtube.com/channel/UC1234567890"

    def test_handles_custom_url_with_at_prefix(self):
        channel_item = {
            "id": "UC1234567890",
            "snippet": {
                "title": "Test Channel",
                "customUrl": "@testchannel",
            },
        }
        result = extract_channel_fields(channel_item)
        assert result is not None
        assert result["channel_url"] == "https://www.youtube.com/@testchannel"

    def test_handles_custom_url_without_at_prefix(self):
        channel_item = {
            "id": "UC1234567890",
            "snippet": {
                "title": "Test Channel",
                "customUrl": "testchannel",
            },
        }
        result = extract_channel_fields(channel_item)
        assert result is not None
        assert result["channel_url"] == "https://www.youtube.com/@testchannel"

    def test_returns_none_when_channel_id_missing(self):
        channel_item = {
            "snippet": {
                "title": "Test Channel",
            },
        }
        result = extract_channel_fields(channel_item)
        assert result is None

    def test_handles_missing_snippet(self):
        channel_item = {"id": "UC1234567890"}
        result = extract_channel_fields(channel_item)
        assert result is not None
        assert result["channel_id"] == "UC1234567890"
        assert result["channel_title"] is None

    def test_handles_invalid_published_at(self):
        channel_item = {
            "id": "UC1234567890",
            "snippet": {
                "title": "Test Channel",
                "publishedAt": "invalid-date",
            },
        }
        result = extract_channel_fields(channel_item)
        assert result is not None
        assert result["channel_updated_at"] is None

