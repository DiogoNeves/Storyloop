"""YouTube OAuth 2.0 experimentation script.

This script demonstrates OAuth 2.0 authentication flow for YouTube Data API.
It follows the pattern from: https://googleapis.github.io/google-api-python-client/docs/oauth-installed.html

I intend to use this script to experiment with the YouTube Data API and
understand the authentication flow, before integrating it into the backend.

This also includes a way to filter out Shorts which we should integrate.
"""

from __future__ import annotations

import os
import json
import re
from datetime import datetime
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
# Also includes YouTube Analytics API access for fetching video statistics
SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]
API_SERVICE_NAME = "youtube"
API_VERSION = "v3"
ANALYTICS_API_SERVICE_NAME = "youtubeAnalytics"
ANALYTICS_API_VERSION = "v2"


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


def get_authenticated_analytics_service():
    """Create and return an authenticated YouTube Analytics service object."""
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

    return build(
        ANALYTICS_API_SERVICE_NAME,
        ANALYTICS_API_VERSION,
        credentials=credentials,
    )


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
    """Filter videos to exclude Shorts based on fileDetails aspect ratio.

    Shorts are typically vertical (height > width) or square (height == width).
    Long-form videos are horizontal (width > height).

    Uses fileDetails.videoStreams[0] which contains the actual video file dimensions.
    Falls back to duration check (≤60 seconds) if fileDetails is not available.

    Args:
        videos: List of video resource dictionaries from YouTube API

    For future reference once integrating:
        YouTube Analytics API - Creator Content Type (For channel owners)
        If you are the content owner (or have authorized access), the YouTube
        Analytics & Reports API provides a reliable indicator. In 2023,
        Google added a dimension called creatorContentType that classifies a
        video view as SHORTS, VIDEO_ON_DEMAND, LIVE_STREAM, etc.
        By querying your channel's analytics with
        dimensions=video,creatorContentType, you can see each video's type.
        For example, an analytics report might return a row like videoId = X,
        creatorContentType = SHORTS for a Short
        This clearly identifies Shorts.

    Returns:
        List of long-form videos (kind="youtube#video" and horizontal aspect ratio)
    """
    long_form_videos = []
    for video in videos:
        # Verify this is a video resource
        if video.get("kind") != "youtube#video":
            continue

        # Method 1: Check fileDetails.videoStreams (most reliable - actual video dimensions)
        is_long_form = is_long_form_by_aspect_ratio(video)
        if is_long_form is not None:
            if is_long_form:
                long_form_videos.append(video)
            continue  # Skip to next video if we determined it's a Short or Long-form

        # Method 2: Fallback to duration check (≤60 seconds = Short)
        if is_long_form_by_duration(video):
            long_form_videos.append(video)

    return long_form_videos


def is_long_form_by_aspect_ratio(video: dict) -> bool | None:
    """Check if video is long-form based on fileDetails aspect ratio.

    Args:
        video: Video resource dictionary from YouTube API

    Returns:
        True if long-form (horizontal), False if Short (vertical/square),
        None if fileDetails not available
    """
    file_details = video.get("fileDetails", {})
    video_streams = file_details.get("videoStreams", [])

    if not video_streams or len(video_streams) == 0:
        return None

    stream = video_streams[0]
    width = stream.get("widthPixels", 0)
    height = stream.get("heightPixels", 0)

    if not width or not height:
        return None

    # Long-form videos are horizontal (width > height)
    # Shorts are vertical (height > width) or square (height == width)
    return width > height


def is_long_form_by_duration(video: dict) -> bool:
    """Check if video is long-form based on duration (>60 seconds).

    Args:
        video: Video resource dictionary from YouTube API

    Returns:
        True if duration > 60 seconds (long-form), False otherwise
    """
    duration = video.get("contentDetails", {}).get("duration", "")
    if not duration:
        return False

    total_seconds = 0
    hours_match = re.search(r"(\d+)H", duration)
    minutes_match = re.search(r"(\d+)M", duration)
    seconds_match = re.search(r"(\d+)S", duration)

    if hours_match:
        total_seconds += int(hours_match.group(1)) * 3600
    if minutes_match:
        total_seconds += int(minutes_match.group(1)) * 60
    if seconds_match:
        total_seconds += int(seconds_match.group(1))

    # Filter out Shorts (≤60 seconds)
    return total_seconds > 60


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


def fetch_video_analytics(
    analytics_service,
    video_id: str,
    start_date: str = "2025-10-01",
    end_date: str = "2025-10-31",
    metrics: str = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained",
    dimensions: str = "day",
    max_results: int = 100,
):
    """Fetch analytics statistics for a specific YouTube video.

    Args:
        analytics_service: Authenticated YouTube Analytics service object
        video_id: The YouTube video ID to fetch stats for
        start_date: Start date in YYYY-MM-DD format (default: "2025-10-01")
        end_date: End date in YYYY-MM-DD format (default: "2025-10-31")
        metrics: Comma-separated list of metrics to retrieve
                 Available metrics include: views, watchTime, estimatedMinutesWatched,
                 averageViewDuration, averageViewPercentage, likes, dislikes,
                 subscribersGained, subscribersLost, etc.
        dimensions: Dimension to group data by (default: "day")
                    Available dimensions include: day, video, country, etc.
        max_results: Maximum number of results to return (default: 100)

    Returns:
        Response dictionary containing analytics data

    See:
        https://developers.google.com/youtube/analytics/reference/reports/query
    """
    report_response = (
        analytics_service.reports()
        .query(
            ids="channel==MINE",
            startDate=start_date,
            endDate=end_date,
            metrics=metrics,
            dimensions=dimensions,
            filters=f"video=={video_id}",
            maxResults=max_results,
        )
        .execute()
    )
    return report_response


def fetch_video_analytics_data(video: dict) -> dict | None:
    """Fetch analytics for a video.

    Args:
        video: Video dictionary from YouTube Data API containing at least an 'id' field

    Returns:
        Analytics data dictionary, or None if fetch failed or video ID is invalid
    """
    if not isinstance(video, dict) or not video.get("id"):
        print("No video ID found, skipping analytics fetch.")
        return None

    video_id_raw = video["id"]
    if not isinstance(video_id_raw, str):
        print("Video ID is not a string, skipping analytics fetch.")
        return None

    video_id: str = video_id_raw
    print(f"\n{'=' * 60}")
    print(f"Fetching Analytics for Video: {video_id}")
    print(f"{'=' * 60}\n")

    analytics_service = get_authenticated_analytics_service()

    # Get video published date to set appropriate date range
    snippet = video.get("snippet", {})
    published_at = (
        snippet.get("publishedAt", "") if isinstance(snippet, dict) else ""
    )
    if published_at:
        # Extract date part (YYYY-MM-DD) from ISO format
        start_date = published_at.split("T")[0]
        # Use current date as end date
        end_date = datetime.now().strftime("%Y-%m-%d")
    else:
        # Fallback to default dates
        start_date = "2025-10-01"
        end_date = "2025-10-31"

    try:
        analytics_data = fetch_video_analytics(
            analytics_service,
            video_id=video_id,
            start_date=start_date,
            end_date=end_date,
            metrics="views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained",
            dimensions="day",
        )
        print("Video Analytics Data:")
        print(json.dumps(analytics_data, indent=2))
        return analytics_data
    except Exception as e:
        print(f"Error fetching analytics: {e}")
        import traceback

        traceback.print_exc()
        return None


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

    # Fetch analytics for the video
    analytics_data = fetch_video_analytics_data(video)

    # Build combined JSON object
    combined_data = {
        "video": video,
        "analytics": analytics_data,
    }

    # Save combined data to file
    with open("youtube_data.json", "w", encoding="utf-8") as f:
        json.dump(combined_data, f, indent=2, ensure_ascii=False)
    print("\nCombined video and analytics data saved to youtube_data.json")


if __name__ == "__main__":
    main()
