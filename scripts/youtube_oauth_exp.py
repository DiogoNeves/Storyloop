"""YouTube OAuth 2.0 experimentation script.

This script demonstrates OAuth 2.0 authentication flow for YouTube Data API.
It follows the pattern from: https://googleapis.github.io/google-api-python-client/docs/oauth-installed.html

I intend to use this script to experiment with the YouTube Data API and
understand the authentication flow, before integrating it into the backend.
"""

from __future__ import annotations

import os
import json
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# The CLIENT_SECRETS_FILE variable specifies the name of a file that contains
# the OAuth 2.0 information for this application, including its client_id and
# client_secret.
CLIENT_SECRETS_FILE = Path(__file__).parent.parent / "client_secret.json"

# Token file to store credentials (user can delete this file to force re-authentication)
TOKEN_FILE = Path(__file__).parent / "youtube_token.json"

# This access scope grants read-only access to the authenticated user's YouTube account.
# See: https://developers.google.com/youtube/v3/guides/auth/installed-apps
SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]
API_SERVICE_NAME = "youtube"
API_VERSION = "v3"


def get_authenticated_service():
    """Create and return an authenticated YouTube service object."""
    credentials = None

    # Try to load existing token from file
    if TOKEN_FILE.exists():
        credentials = Credentials.from_authorized_user_file(
            str(TOKEN_FILE), SCOPES
        )

    # If no valid credentials, run OAuth flow
    if not credentials or not credentials.valid:
        flow = InstalledAppFlow.from_client_secrets_file(
            str(CLIENT_SECRETS_FILE), SCOPES
        )
        # You can use either run_console() or run_local_server() here
        # run_console() - user pastes code manually
        # run_local_server() - opens browser and listens on localhost
        credentials = flow.run_local_server(
            host="localhost",
            port=8080,
            authorization_prompt_message="Please visit this URL: {url}",
            success_message="The auth flow is complete; you may close this window.",
            open_browser=True,
        )
        # Save credentials to file for future use
        with open(TOKEN_FILE, "w") as token:
            token.write(credentials.to_json())

    return build(API_SERVICE_NAME, API_VERSION, credentials=credentials)


def list_latest_long_form_video(service):
    """List latest YouTube long form video for the authenticated user.

    This function:
    1. Gets the authenticated user's channel
    2. Retrieves the uploads playlist ID
    3. Fetches videos from that playlist
    4. Optionally filters for long-form videos (longer than 8 minutes)
    """
    # Step 1: Get the authenticated user's channel
    channel_response = (
        service.channels()
        .list(
            part="contentDetails",
            mine=True,
            maxResults=1,
        )
        .execute()
    )

    if not channel_response.get("items"):
        return {"items": []}

    # Step 2: Get the uploads playlist ID
    uploads_playlist_id = channel_response["items"][0]["contentDetails"][
        "relatedPlaylists"
    ]["uploads"]

    # Step 3: Get videos from the uploads playlist
    playlist_items_response = (
        service.playlistItems()
        .list(
            part="snippet,contentDetails",
            playlistId=uploads_playlist_id,
            maxResults=50,
        )
        .execute()
    )

    if not playlist_items_response.get("items"):
        return {"items": []}

    # Step 4: Extract video IDs and get full video details
    video_ids = [
        item["snippet"]["resourceId"]["videoId"]
        for item in playlist_items_response["items"]
    ]

    # Step 5: Get full video details including all available parts for inspection
    videos_response = (
        service.videos()
        .list(
            part="contentDetails,fileDetails,id,liveStreamingDetails,localizations,player,processingDetails,recordingDetails,snippet,statistics,status,suggestions,topicDetails",
            id=",".join(video_ids),
            maxResults=50,
        )
        .execute()
    )

    # Filter for long-form videos
    all_videos = videos_response.get("items", [])
    long_form_videos = filter_long_form_videos(all_videos)

    return long_form_videos[0]


def filter_long_form_videos(videos: list[dict]) -> list[dict]:
    """Filter videos to exclude Shorts based on aspect ratio.

    Shorts are typically vertical (height > width) or square (height == width).
    Long-form videos are horizontal (width > height).

    Args:
        videos: List of video resource dictionaries from YouTube API

    Returns:
        List of long-form videos (kind="youtube#video" and horizontal aspect ratio)
    """
    long_form_videos = []
    for video in videos:
        # Verify this is a video resource
        if video.get("kind") != "youtube#video":
            continue

        # Check aspect ratio from thumbnails (use maxres if available, else high)
        thumbnails = video.get("snippet", {}).get("thumbnails", {})
        thumbnail = (
            thumbnails.get("maxres")
            or thumbnails.get("high")
            or thumbnails.get("standard")
        )

        if not thumbnail:
            continue

        width = thumbnail.get("width", 0)
        height = thumbnail.get("height", 0)

        # Skip if dimensions are missing or invalid
        if not width or not height:
            continue

        # Long-form videos are horizontal (width > height)
        # Shorts are vertical (height > width) or square (height == width)
        if width > height:
            long_form_videos.append(video)

    return long_form_videos


def list_video_categories(service, region_code: str = "US"):
    """List available video categories for the specified region.

    Args:
        service: Authenticated YouTube service object
        region_code: ISO 3166-1 alpha-2 country code (default: "US")

    Returns:
        Response dictionary containing video categories
    """
    response = (
        service.videoCategories()
        .list(part="snippet", regionCode=region_code)
        .execute()
    )
    return response


def main():
    """Main entry point for the script."""
    # When running locally, disable OAuthlib's HTTPs verification.
    # When running in production *do not* leave this option enabled.
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

    service = get_authenticated_service()

    # List latest long-form video
    video = list_latest_long_form_video(service)
    print("Latest Long-Form Video:")
    print(json.dumps(video, indent=2))

    # Save to file
    with open("youtube_data.json", "w", encoding="utf-8") as f:
        json.dump(video, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
