import pytest

from app.services.youtube_transformers import (
    VideoDetailParseError,
    build_videos_with_details,
    parse_video_detail_response,
)


def test_build_videos_with_details_does_not_mutate_playlist_items() -> None:
    playlist_items = [
        {
            "snippet": {
                "title": "Video",
                "description": "",
                "publishedAt": "2024-01-01T00:00:00Z",
                "resourceId": {"videoId": "vid-1"},
            },
            "contentDetails": {},
        }
    ]

    videos = build_videos_with_details(
        playlist_items,
        durations={"vid-1": "PT2M0S"},
        live_content={"vid-1": "none"},
        privacy_status={"vid-1": "public"},
    )

    assert len(videos) == 1
    assert videos[0].video_type == "short"
    assert "privacyStatus" not in playlist_items[0]["snippet"]
    assert "duration" not in playlist_items[0]["contentDetails"]


def test_parse_video_detail_response_parses_statistics() -> None:
    video = parse_video_detail_response(
        [
            {
                "id": "vid-1",
                "snippet": {
                    "title": "Video",
                    "description": "",
                    "publishedAt": "2024-01-01T00:00:00Z",
                },
                "contentDetails": {"duration": "PT10M0S"},
                "status": {"privacyStatus": "public"},
                "statistics": {"viewCount": "10", "likeCount": "2"},
            }
        ],
        "vid-1",
    )

    assert video.id == "vid-1"
    assert video.statistics is not None
    assert video.statistics.view_count == 10
    assert video.statistics.like_count == 2


def test_parse_video_detail_response_raises_when_missing_video() -> None:
    with pytest.raises(VideoDetailParseError):
        parse_video_detail_response([], "missing")
