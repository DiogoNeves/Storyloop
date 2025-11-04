"""CLI helper for authenticating with the YouTube Data API v3 + Analytics API.

Usage (set the OAuth client credentials as environment variables):
    export YOUTUBE_OAUTH_CLIENT_ID=...
    export YOUTUBE_OAUTH_CLIENT_SECRETS=...
    uv run python scripts/youtube_oauth_login.py

Install dependencies if needed:
    uv pip install google-auth google-auth-oauthlib google-api-python-client python-dotenv

The script performs an interactive OAuth flow in the terminal, then prints details
about the most recent uploaded video plus its impressions click-through rate (CTR).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Dict, List

from dotenv import load_dotenv
from google.auth.credentials import Credentials as GoogleCredentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import Resource, build

CLIENT_ID_ENV = "YOUTUBE_OAUTH_CLIENT_ID"
CLIENT_SECRET_ENV = "YOUTUBE_OAUTH_CLIENT_SECRETS"
PROJECT_ID_ENV = "GOOGLE_PROJECT_ID"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]


load_dotenv(override=True)


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


def load_client_config() -> Dict[str, Any]:
    client_id = os.environ.get(CLIENT_ID_ENV)
    client_secret = os.environ.get(CLIENT_SECRET_ENV)
    project_id = os.environ.get(PROJECT_ID_ENV)

    if not client_id or not client_secret:
        raise SystemExit(
            "Set the environment variables "
            f"{CLIENT_ID_ENV} and {CLIENT_SECRET_ENV} before running this script."
        )

    installed_config: Dict[str, Any] = {
        "client_id": client_id,
        "client_secret": client_secret,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "redirect_uris": ["http://localhost", "http://localhost:8080"],
    }

    if project_id:
        installed_config["project_id"] = project_id

    return {"installed": installed_config}


def run_oauth_flow(client_config: Dict[str, Any]) -> GoogleCredentials:
    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
    # run_local_server() opens a browser, starts a local server to handle the redirect,
    # and automatically completes the OAuth flow. This is the recommended approach.
    print("\nStarting OAuth flow...")
    print("A browser window will open for you to authorize the application.\n")
    return flow.run_local_server(port=8080)


def build_youtube_clients(
    credentials: GoogleCredentials,
) -> tuple[Resource, Resource]:
    youtube = build("youtube", "v3", credentials=credentials)
    analytics = build("youtubeAnalytics", "v2", credentials=credentials)
    return youtube, analytics


def fetch_latest_uploaded_video(youtube_client: Resource) -> VideoInfo:
    channels_response: Dict[str, Any] = (
        youtube_client.channels()
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
        youtube_client.playlistItems()
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
        analytics_client.reports()
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
        "and configured the redirect URI to include 'http://localhost' or 'http://localhost:8080'"
    )
    print(
        "Set the credentials via environment variables before running this script:"
    )
    print(f"  {CLIENT_ID_ENV}=... and {CLIENT_SECRET_ENV}=...")
    print(
        "  Optionally set GOOGLE_PROJECT_ID if your OAuth client expects it.\n"
    )
    print(
        "Environment variables from a .env file in this directory are loaded automatically.\n"
    )

    client_config = load_client_config()
    credentials = run_oauth_flow(client_config)

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
