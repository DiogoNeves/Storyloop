"""CLI helper for authenticating with the YouTube Data API v3 + Analytics API.

Usage:
    export YOUTUBE_OAUTH_CLIENT_SECRETS=/absolute/path/to/client_secret.json
    uv run python scripts/youtube_oauth_login.py

Install dependencies if needed:
    uv pip install google-auth google-auth-oauthlib google-api-python-client

The script performs an interactive OAuth flow in the terminal, then prints details
about the most recent uploaded video plus its impressions click-through rate (CTR).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Dict, List, Union

from google.auth.external_account_authorized_user import (
    Credentials as ExternalCredentials,
)
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import Resource, build

CLIENT_SECRETS_PATH_ENV = "YOUTUBE_OAUTH_CLIENT_SECRETS"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]


@dataclass
class VideoInfo:
    video_id: str
    title: str
    published_at: datetime


@dataclass
class VideoAnalytics:
    impressions: float
    views: float
    impressions_ctr: float


def load_client_secrets_path() -> str:
    client_secrets_path = os.environ.get(CLIENT_SECRETS_PATH_ENV)
    if not client_secrets_path:
        raise SystemExit(
            "Set the environment variable"
            f" {CLIENT_SECRETS_PATH_ENV} to the OAuth client secrets JSON file."
        )

    if not os.path.exists(client_secrets_path):
        raise SystemExit(
            f"Client secrets file not found: {client_secrets_path}"
        )

    return client_secrets_path


def run_oauth_flow(
    client_secrets_path: str,
) -> Union[Credentials, ExternalCredentials]:
    flow = InstalledAppFlow.from_client_secrets_file(
        client_secrets_path, scopes=SCOPES
    )
    # run_local_server starts a local web server and opens the browser for authorization.
    return flow.run_local_server(port=0)


def build_youtube_clients(
    credentials: Union[Credentials, ExternalCredentials],
) -> tuple[Resource, Resource]:
    youtube = build("youtube", "v3", credentials=credentials)
    analytics = build("youtubeAnalytics", "v2", credentials=credentials)
    return youtube, analytics


def fetch_latest_uploaded_video(youtube_client: Resource) -> VideoInfo:
    channels_response: Dict[str, Any] = (
        youtube_client.channels()  # type: ignore[attr-defined]
        .list(part="contentDetails", mine=True)
        .execute()
    )

    items: List[Dict[str, Any]] = channels_response.get("items", [])
    if not items:
        raise SystemExit("No channels found for the authenticated account.")

    uploads_playlist_id = items[0]["contentDetails"]["relatedPlaylists"][
        "uploads"
    ]

    playlist_response: Dict[str, Any] = (
        youtube_client.playlistItems()  # type: ignore[attr-defined]
        .list(playlistId=uploads_playlist_id, part="snippet", maxResults=1)
        .execute()
    )

    playlist_items: List[Dict[str, Any]] = playlist_response.get("items", [])
    if not playlist_items:
        raise SystemExit("No uploaded videos found in the channel.")

    latest = playlist_items[0]["snippet"]
    video_id = latest["resourceId"]["videoId"]
    title = latest["title"]
    published_at = datetime.fromisoformat(
        latest["publishedAt"].replace("Z", "+00:00")
    )

    return VideoInfo(video_id=video_id, title=title, published_at=published_at)


def fetch_video_ctr(
    analytics_client: Resource, video: VideoInfo
) -> VideoAnalytics | None:
    start_date = video.published_at.date().isoformat()
    end_date = datetime.now(UTC).date().isoformat()

    report: Dict[str, Any] = (
        analytics_client.reports()  # type: ignore[attr-defined]
        .query(
            ids="channel==MINE",
            filters=f"video=={video.video_id}",
            startDate=start_date,
            endDate=end_date,
            metrics="impressions,impressionsClickThroughRate,views",
        )
        .execute()
    )

    rows = report.get("rows")
    if not rows:
        return None

    impressions, ctr, views = rows[0]
    return VideoAnalytics(
        impressions=float(impressions),
        impressions_ctr=float(ctr),
        views=float(views),
    )


def format_pct(value: float) -> str:
    return f"{value * 100:.2f}%"


def main() -> None:
    print("\n=== YouTube OAuth CLI Demo ===\n")
    print(
        "This script authenticates via OAuth, fetches your latest upload, and prints its CTR."
    )
    print(
        "Make sure you have created an OAuth 2.0 Client ID (Desktop type) in Google Cloud"
    )
    print(
        f"and saved the JSON file locally. Set {CLIENT_SECRETS_PATH_ENV} to point to that file.\n"
    )

    client_secrets_path = load_client_secrets_path()
    credentials = run_oauth_flow(client_secrets_path)

    youtube_client, analytics_client = build_youtube_clients(credentials)
    latest_video = fetch_latest_uploaded_video(youtube_client)

    analytics = fetch_video_ctr(analytics_client, latest_video)

    print("\nLatest uploaded video:")
    print(f"  Title: {latest_video.title}")
    print(f"  Video ID: {latest_video.video_id}")
    print(f"  Published at: {latest_video.published_at.isoformat()}")

    if analytics is None:
        print(
            "\nNo CTR data available for this video yet. Try again after the video has gathered impressions."
        )
        return

    print("\nAnalytics summary (lifetime):")
    print(f"  Impressions: {analytics.impressions:,.0f}")
    print(f"  Views: {analytics.views:,.0f}")
    print(f"  Impressions CTR: {format_pct(analytics.impressions_ctr)}")


if __name__ == "__main__":
    main()
