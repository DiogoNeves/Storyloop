"""CLI helper for authenticating with the YouTube Data API v3 + Analytics API.

Usage:
    export YOUTUBE_OAUTH_CLIENT_SECRET=/absolute/path/to/client_secret.json
    # Optional: export GOOGLE_OAUTH_TOKEN_PATH=/absolute/path/to/youtube_token.json
    uv run python scripts/youtube_oauth_login.py

Install dependencies if needed:
    uv pip install google-auth google-auth-oauthlib google-api-python-client

The script performs an interactive OAuth flow in the terminal, persists the OAuth
tokens for reuse, and then prints details about the most recent uploaded video
plus its impressions click-through rate (CTR).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Dict, List

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import Resource, build

CLIENT_SECRETS_PATH_ENV = "YOUTUBE_OAUTH_CLIENT_SECRET"
TOKEN_PATH_ENV = "GOOGLE_OAUTH_TOKEN_PATH"
DEFAULT_TOKEN_PATH = "youtube_token.json"
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


def load_client_config() -> tuple[str, Dict[str, Any]]:
    client_secrets_path = os.environ.get(CLIENT_SECRETS_PATH_ENV)
    if not client_secrets_path:
        raise SystemExit(
            "Set the environment variable"
            f" {CLIENT_SECRETS_PATH_ENV} to the OAuth client secrets JSON file."
        )

    if not os.path.exists(client_secrets_path):
        raise SystemExit(f"Client secrets file not found: {client_secrets_path}")

    with open(client_secrets_path, "r", encoding="utf-8") as f:
        client_file: Dict[str, Any] = json.load(f)

    installed_config = client_file.get("installed")
    if not installed_config:
        raise SystemExit(
            "The client secrets JSON must be created as an OAuth Client ID of type 'Desktop'."
        )

    redirect_uris = installed_config.get("redirect_uris") or ["http://localhost"]

    minimal_config: Dict[str, Any] = {
        "client_id": installed_config["client_id"],
        "client_secret": installed_config["client_secret"],
        "auth_uri": installed_config.get("auth_uri", "https://accounts.google.com/o/oauth2/auth"),
        "token_uri": installed_config.get("token_uri", "https://oauth2.googleapis.com/token"),
        "redirect_uris": redirect_uris,
    }

    return client_secrets_path, minimal_config


def get_token_path() -> str:
    return os.environ.get(TOKEN_PATH_ENV, DEFAULT_TOKEN_PATH)


def run_oauth_flow(client_config: Dict[str, Any], token_path: str) -> Credentials:
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
        if creds and creds.valid:
            return creds
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(token_path, "w", encoding="utf-8") as token_file:
                token_file.write(creds.to_json())
            return creds

    flow = InstalledAppFlow.from_client_config({"installed": client_config}, scopes=SCOPES)
    credentials = flow.run_local_server(
        port=0,
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
        success_message="Authentication complete. You may close this window.",
    )
    with open(token_path, "w", encoding="utf-8") as token_file:
        token_file.write(credentials.to_json())
    return credentials


def build_youtube_clients(credentials: Credentials) -> tuple[Resource, Resource]:
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

    uploads_playlist_id = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]

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
    published_at = datetime.fromisoformat(latest["publishedAt"].replace("Z", "+00:00"))

    return VideoInfo(video_id=video_id, title=title, published_at=published_at)


def fetch_video_ctr(analytics_client: Resource, video: VideoInfo) -> VideoAnalytics | None:
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
        "Make sure you have created an OAuth 2.0 Client ID (Desktop type) in Google Cloud,"
    )
    print(
        f"enabled both the YouTube Data API v3 and YouTube Analytics API for the project,"
    )
    print(
        f"and saved the JSON file locally. Set {CLIENT_SECRETS_PATH_ENV} to point to that file."
    )
    print(
        "No redirect URI configuration is required for Desktop clients; the flow spins up a local loopback server."
    )
    print(
        f"Optional: set {TOKEN_PATH_ENV} to choose where refreshed credentials are stored (defaults to {DEFAULT_TOKEN_PATH}).\n"
    )

    client_secrets_path, client_config = load_client_config()
    token_path = get_token_path()

    print(f"Using OAuth client config from: {client_secrets_path}")
    print(f"Credential cache path: {token_path}")

    credentials = run_oauth_flow(client_config, token_path)

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

    print(
        "\nSuccess! Future runs will reuse the stored credentials unless you revoke or delete the token file."
    )


if __name__ == "__main__":
    main()
