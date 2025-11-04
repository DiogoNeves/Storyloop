"""CLI helper for authenticating with the YouTube Data API v3 + Analytics API.

Usage (set the OAuth client credentials as environment variables):
    export YOUTUBE_OAUTH_CLIENT_ID=...
    export YOUTUBE_OAUTH_CLIENT_SECRETS=...
    export GOOGLE_PROJECT_ID=...  # optional
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
from typing import Any, Dict, List, Union

from dotenv import load_dotenv
from google.auth.external_account_authorized_user import (
    Credentials as ExternalCredentials,
)
from google.oauth2.credentials import Credentials
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
    # Try to load from JSON file first (if provided via env var)
    json_path = os.environ.get("YOUTUBE_OAUTH_JSON_PATH")
    if json_path and os.path.exists(json_path):
        import json

        with open(json_path) as f:
            config = json.load(f)
            # Ensure redirect_uris includes port 8080 for run_local_server
            # run_local_server uses http://localhost:8080/ (with trailing slash)
            if "installed" in config:
                redirect_uris = config["installed"].get("redirect_uris", [])
                # Add both with and without trailing slash, and ensure port 8080 is included
                needed_uris = [
                    "http://localhost",
                ]
                for uri in needed_uris:
                    if uri not in redirect_uris:
                        redirect_uris.append(uri)
                config["installed"]["redirect_uris"] = redirect_uris
            return config

    # Fall back to environment variables
    client_id = os.environ.get(CLIENT_ID_ENV)
    client_secret = os.environ.get(CLIENT_SECRET_ENV)
    project_id = os.environ.get(PROJECT_ID_ENV)

    if not client_id or not client_secret:
        raise SystemExit(
            "Set the environment variables "
            f"{CLIENT_ID_ENV} and {CLIENT_SECRET_ENV} before running this script, "
            "or set YOUTUBE_OAUTH_JSON_PATH to point to your client_secret JSON file."
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


def run_oauth_flow(
    client_config: Dict[str, Any],
) -> Union[Credentials, ExternalCredentials]:
    # Determine the redirect URI and port from config
    redirect_uris = client_config.get("installed", {}).get("redirect_uris", [])
    port = 8000  # Default port

    # Try to extract port from redirect_uris if available
    for uri in redirect_uris:
        if uri.startswith("http://localhost:"):
            try:
                port = int(uri.split(":")[-1].rstrip("/"))
                break
            except ValueError:
                pass
        elif uri == "http://localhost":
            # If only http://localhost is configured, we'll use 8080 but warn the user
            print(
                "\n⚠️  Warning: Your OAuth client is configured with 'http://localhost'"
            )
            print(
                "   but the script will use port 8080. Make sure 'http://localhost:8080'"
            )
            print("   is also configured in Google Cloud Console.\n")

    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
    redirect_uri = f"http://localhost:{port}/"

    print("\nStarting OAuth flow...")
    print(f"Redirect URI will be: {redirect_uri}")
    print(
        "Make sure this exact URI is configured in your Google Cloud Console:"
    )
    print(
        "  Google Cloud Console → APIs & Services → Credentials → Your OAuth Client"
    )
    print("  → Authorized redirect URIs → Add: http://localhost:8080\n")

    try:
        return flow.run_local_server(port=port, open_browser=True)
    except Exception as e:
        error_msg = str(e)
        print(f"\n❌ Error during OAuth flow: {error_msg}")
        print("\nCommon issues and solutions:")
        print("\n1. Error 403: access_denied - App not verified")
        print("   → Your OAuth app is in 'Testing' mode")
        print("   → Add your email as a test user in Google Cloud Console:")
        print(
            "     APIs & Services → OAuth consent screen → Test users → Add Users"
        )
        print("\n2. Redirect URI mismatch (Error 400: redirect_uri_mismatch)")
        print(
            "   → Ensure 'http://localhost:8080' is configured in Google Cloud Console:"
        )
        print(
            "     APIs & Services → Credentials → Your OAuth Client → Authorized redirect URIs"
        )
        print("\n3. Port already in use")
        print("   → Another process is using port 8080")
        print("   → Kill it with: lsof -ti:8080 | xargs kill -9")
        print("\n4. OAuth client not configured for Desktop app type")
        print(
            "   → Create a new OAuth 2.0 Client ID with application type 'Desktop app'"
        )
        raise


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
    print("\n📋 Prerequisites:")
    print(
        "1. OAuth 2.0 Client ID (Desktop type) created in Google Cloud Console"
    )
    print(
        "2. Redirect URI configured: 'http://localhost:8080' in Authorized redirect URIs"
    )
    print(
        "3. If app is in Testing mode: Your email must be added as a test user"
    )
    print("   (Google Cloud Console → OAuth consent screen → Test users)")
    print("\nSet credentials via environment variable:")
    print("  YOUTUBE_OAUTH_JSON_PATH=/path/to/client_secret.json")
    print("Or via environment variables:")
    print(f"  {CLIENT_ID_ENV}=... and {CLIENT_SECRET_ENV}=...\n")

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
