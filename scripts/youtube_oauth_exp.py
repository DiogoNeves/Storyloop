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
import csv
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# The CLIENT_SECRETS_FILE variable specifies the name of a file that contains
# the OAuth 2.0 information for this application, including its client_id and
# client_secret.
CLIENT_SECRETS_FILE = Path(__file__).parent / "client_secret.json"

ENV_CLIENT_ID = "YOUTUBE_OAUTH_CLIENT_ID_CLI"
ENV_CLIENT_SECRET = "YOUTUBE_OAUTH_CLIENT_SECRET_CLI"
ENV_REDIRECT_URI = "YOUTUBE_REDIRECT_URI"
ENV_PROJECT_ID = "GOOGLE_PROJECT_ID"

DEFAULT_REDIRECT_URI = "http://localhost:8080/"

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


def load_client_config() -> dict[str, Any]:
    """Build OAuth client config from environment variables or local file."""
    # Load environment variables from .env file if present
    root_dir = Path(__file__).parent.parent
    env_path = root_dir / ".env"
    if env_path.exists():
        load_dotenv(env_path)

    client_id = os.getenv(ENV_CLIENT_ID)
    client_secret = os.getenv(ENV_CLIENT_SECRET)
    redirect_uri = os.getenv(ENV_REDIRECT_URI)
    project_id = os.getenv(ENV_PROJECT_ID)

    if client_id and client_secret:
        redirect_uris = (
            [redirect_uri] if redirect_uri else [DEFAULT_REDIRECT_URI]
        )

        client_config: dict[str, Any] = {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": redirect_uris,
            }
        }

        if project_id:
            client_config["installed"]["project_id"] = project_id

        return client_config

    if CLIENT_SECRETS_FILE.exists():
        with open(CLIENT_SECRETS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)

    missing = []
    if not client_id:
        missing.append(ENV_CLIENT_ID)
    if not client_secret:
        missing.append(ENV_CLIENT_SECRET)

    raise RuntimeError(
        "Missing OAuth client configuration. Set environment variables "
        f"{', '.join(missing)} or provide client_secret.json."
    )


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
        flow = InstalledAppFlow.from_client_config(load_client_config(), SCOPES)
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
        flow = InstalledAppFlow.from_client_config(load_client_config(), SCOPES)
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


def get_channel_details(service):
    """Get channel details for the authenticated user.

    Extracts only the fields matching the UserRecord schema:
    - channel_id
    - channel_title
    - channel_url
    - channel_thumbnail_url
    - channel_updated_at

    Args:
        service: Authenticated YouTube service object

    Returns:
        Dictionary containing channel information matching UserRecord schema, or None if no channel found
    """
    channel_response = (
        service.channels()
        .list(part="id,snippet", mine=True, maxResults=1)
        .execute()
    )

    items = channel_response.get("items", [])
    if not items:
        return None

    item = items[0]
    channel_id = item.get("id")
    snippet = item.get("snippet", {})

    # Extract fields matching UserRecord schema
    channel_title = snippet.get("title")

    # Build channel URL - prefer custom URL if available
    custom_url = snippet.get("customUrl")
    if custom_url:
        channel_url = f"https://www.youtube.com/@{custom_url.lstrip('@')}"
    else:
        channel_url = f"https://www.youtube.com/channel/{channel_id}"

    # Get thumbnail URL (prefer default, fallback to any available)
    thumbnails = snippet.get("thumbnails", {})
    channel_thumbnail_url = (
        thumbnails.get("default", {}).get("url")
        or thumbnails.get("medium", {}).get("url")
        or thumbnails.get("high", {}).get("url")
    )

    # Use publishedAt as channel_updated_at (closest available timestamp)
    published_at_str = snippet.get("publishedAt")
    channel_updated_at = None
    if published_at_str:
        try:
            channel_updated_at = datetime.fromisoformat(
                published_at_str.replace("Z", "+00:00")
            )
        except (ValueError, AttributeError):
            pass

    return {
        "channel_id": channel_id,
        "channel_title": channel_title,
        "channel_url": channel_url,
        "channel_thumbnail_url": channel_thumbnail_url,
        "channel_updated_at": channel_updated_at.isoformat()
        if channel_updated_at
        else None,
    }


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
                 Note: impressions, clicks, and impressionsClickThroughRate may not
                 be available via the API (video-level CTR is not officially supported).
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


def _get_metric_indices(column_headers: list[dict]) -> dict[str, int]:
    """Extract metric name to column index mapping from column headers.

    Args:
        column_headers: List of column header dictionaries from API response

    Returns:
        Dictionary mapping metric names to their column indices
    """
    metric_indices = {}
    for i, header in enumerate(column_headers):
        if header.get("columnType") == "METRIC":
            metric_name = header.get("name", "")
            metric_indices[metric_name] = i
    return metric_indices


def _calculate_ctr_from_impressions_clicks(
    analytics_data: dict, impressions_idx: int, clicks_idx: int
) -> bool:
    """Calculate CTR from impressions and clicks metrics.

    Args:
        analytics_data: Analytics data dictionary (will be modified)
        impressions_idx: Column index for impressions metric
        clicks_idx: Column index for clicks metric

    Returns:
        True if CTR was successfully calculated, False otherwise
    """
    rows = analytics_data.get("rows", [])

    # Calculate total impressions and clicks across all days
    total_impressions = 0
    total_clicks = 0

    for row in rows:
        if len(row) > max(impressions_idx, clicks_idx):
            try:
                impressions = (
                    int(row[impressions_idx]) if row[impressions_idx] else 0
                )
                clicks = int(row[clicks_idx]) if row[clicks_idx] else 0
                total_impressions += impressions
                total_clicks += clicks
            except (ValueError, TypeError):
                continue

    # Calculate CTR
    if total_impressions > 0:
        ctr = (total_clicks / total_impressions) * 100
        if "metadata" not in analytics_data:
            analytics_data["metadata"] = {}
        analytics_data["metadata"]["ctr_available"] = True
        analytics_data["metadata"]["calculated_ctr"] = round(ctr, 2)
        analytics_data["metadata"]["total_impressions"] = total_impressions
        analytics_data["metadata"]["total_clicks"] = total_clicks
        analytics_data["metadata"]["ctr_formula"] = (
            f"({total_clicks} / {total_impressions}) × 100 = {ctr:.2f}%"
        )
        print(
            f"✓ Calculated CTR: {ctr:.2f}% ({total_clicks} clicks / {total_impressions} impressions)"
        )
        return True
    else:
        if "metadata" not in analytics_data:
            analytics_data["metadata"] = {}
        analytics_data["metadata"]["ctr_available"] = False
        analytics_data["metadata"]["ctr_note"] = (
            "No impressions data available to calculate CTR"
        )
        return False


def _extract_ctr_from_api(analytics_data: dict, ctr_idx: int) -> bool:
    """Extract CTR value if provided directly by the API.

    Args:
        analytics_data: Analytics data dictionary (will be modified)
        ctr_idx: Column index for impressionsClickThroughRate metric

    Returns:
        True if CTR was successfully extracted, False otherwise
    """
    rows = analytics_data.get("rows", [])
    total_ctr = 0
    count = 0

    for row in rows:
        if len(row) > ctr_idx:
            try:
                ctr_value = float(row[ctr_idx]) if row[ctr_idx] else 0
                total_ctr += ctr_value
                count += 1
            except (ValueError, TypeError):
                continue

    if count > 0:
        avg_ctr = total_ctr / count
        if "metadata" not in analytics_data:
            analytics_data["metadata"] = {}
        analytics_data["metadata"]["ctr_available"] = True
        analytics_data["metadata"]["average_ctr"] = round(avg_ctr, 2)
        print(f"✓ Retrieved CTR from API: {avg_ctr:.2f}% (average)")
        return True
    return False


def _calculate_proxy_ctr(analytics_data: dict) -> dict | None:
    """Calculate a proxy CTR estimate using available metrics.

    This uses views and engagement metrics to estimate CTR. Note that this is
    NOT a true CTR, but can serve as a proxy metric for comparison purposes.

    Args:
        analytics_data: Analytics data dictionary (will be modified)

    Returns:
        Dictionary with proxy CTR data if calculation successful, None otherwise
    """
    column_headers = analytics_data.get("columnHeaders", [])
    rows = analytics_data.get("rows", [])
    metric_indices = _get_metric_indices(column_headers)

    if "views" not in metric_indices:
        return None

    views_idx = metric_indices["views"]
    total_views = 0
    view_days = 0

    # Calculate average daily views
    for row in rows:
        if len(row) > views_idx:
            try:
                views = int(row[views_idx]) if row[views_idx] else 0
                if views > 0:
                    total_views += views
                    view_days += 1
            except (ValueError, TypeError):
                continue

    if total_views == 0:
        return None

    # Estimate impressions: typically 10-50x views for new videos
    # This is a rough estimate based on typical YouTube behavior
    estimated_impressions = total_views * 20  # Conservative estimate

    # Calculate proxy CTR
    proxy_ctr = (total_views / estimated_impressions) * 100

    return {
        "proxy_ctr": round(proxy_ctr, 2),
        "total_views": total_views,
        "estimated_impressions": estimated_impressions,
        "note": "This is an ESTIMATED proxy CTR, not a true CTR. Actual CTR requires impressions data from YouTube Studio.",
    }


def _add_ctr_unavailable_metadata(analytics_data: dict) -> None:
    """Add metadata explaining that CTR is not available.

    Also attempts to calculate a proxy CTR estimate using available metrics.

    Args:
        analytics_data: Analytics data dictionary (will be modified)
    """
    if "metadata" not in analytics_data:
        analytics_data["metadata"] = {}
    analytics_data["metadata"]["ctr_available"] = False
    analytics_data["metadata"]["ctr_note"] = (
        "Video-level CTR (Click-Through Rate) is not available via the "
        "YouTube Analytics API. To view CTR, you must use YouTube Studio directly. "
        "CTR = (Clicks / Impressions) × 100, where Impressions = number of times "
        "the thumbnail was shown, and Clicks = number of thumbnail clicks."
    )

    # Try to calculate proxy CTR
    proxy_ctr_data = _calculate_proxy_ctr(analytics_data)
    if proxy_ctr_data:
        analytics_data["metadata"]["proxy_ctr"] = proxy_ctr_data["proxy_ctr"]
        analytics_data["metadata"]["proxy_ctr_note"] = proxy_ctr_data["note"]
        analytics_data["metadata"]["estimated_impressions"] = proxy_ctr_data[
            "estimated_impressions"
        ]
        analytics_data["metadata"]["how_to_get_real_ctr"] = (
            "To get real CTR:\n"
            "1. Go to https://studio.youtube.com/\n"
            "2. Navigate to Analytics > Advanced Mode\n"
            "3. Select 'Impressions' and 'Impressions click-through rate' metrics\n"
            "4. Export as CSV\n"
            "5. Use import_ctr_from_csv() function to load the data"
        )
        print(
            f"⚠ CTR not available via API. Estimated proxy CTR: {proxy_ctr_data['proxy_ctr']}%"
        )
        print(
            "   Note: This is an estimate, not real CTR. See metadata for how to get real CTR."
        )
    else:
        print(
            "⚠ CTR cannot be calculated: impressions and clicks metrics not available"
        )


def calculate_ctr_from_data(analytics_data: dict, video_id: str) -> dict:
    """Calculate CTR manually if impressions/clicks are available in the data.

    If CTR metrics are not available via the API, this function adds metadata
    explaining why CTR cannot be calculated. If impressions and clicks are present,
    it calculates CTR and adds it to the response.

    Args:
        analytics_data: Analytics data dictionary from API response
        video_id: Video ID for reference

    Returns:
        Analytics data dictionary with CTR calculation added if possible
    """
    column_headers = analytics_data.get("columnHeaders", [])
    metric_indices = _get_metric_indices(column_headers)

    has_impressions = "impressions" in metric_indices
    has_clicks = "clicks" in metric_indices
    has_ctr = "impressionsClickThroughRate" in metric_indices

    # Try to calculate CTR from impressions and clicks
    if has_impressions and has_clicks:
        impressions_idx = metric_indices["impressions"]
        clicks_idx = metric_indices["clicks"]
        _calculate_ctr_from_impressions_clicks(
            analytics_data, impressions_idx, clicks_idx
        )
    # Try to extract CTR if provided directly by API
    elif has_ctr:
        ctr_idx = metric_indices["impressionsClickThroughRate"]
        if not _extract_ctr_from_api(analytics_data, ctr_idx):
            _add_ctr_unavailable_metadata(analytics_data)
    # No CTR data available
    else:
        _add_ctr_unavailable_metadata(analytics_data)

    return analytics_data


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

    # Try to fetch CTR-related metrics (impressions, clicks, impressionsClickThroughRate)
    # Note: These metrics may not be available - video-level CTR is not officially
    # supported by the YouTube Analytics API, but we'll attempt to fetch them anyway.
    ctr_metrics = "impressions,clicks,impressionsClickThroughRate"
    # Include subscribersLost for SPV calculation
    # Note: relativeRetentionPerformance cannot be queried with 'day' dimension, fetch separately
    standard_metrics = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost"

    # First, try with CTR metrics included
    all_metrics = f"{standard_metrics},{ctr_metrics}"

    analytics_data = None

    try:
        print(f"Attempting to fetch analytics with CTR metrics: {ctr_metrics}")
        analytics_data = fetch_video_analytics(
            analytics_service,
            video_id=video_id,
            start_date=start_date,
            end_date=end_date,
            metrics=all_metrics,
            dimensions="day",
        )
        # Check if CTR metrics are actually in the response
        column_headers = analytics_data.get("columnHeaders", [])
        metric_names = [
            h["name"] for h in column_headers if h.get("columnType") == "METRIC"
        ]
        if (
            "impressions" in metric_names
            or "impressionsClickThroughRate" in metric_names
            or "clicks" in metric_names
        ):
            print("✓ CTR metrics successfully retrieved!")
        else:
            print(
                "⚠ CTR metrics requested but not found in response (likely not available)"
            )
    except Exception as e:
        error_msg = str(e).lower()
        # Check if error is specifically about unavailable metrics
        if (
            "invalid" in error_msg
            or "metric" in error_msg
            or "not supported" in error_msg
        ):
            print(f"⚠ CTR metrics not available: {e}")
            print("Falling back to standard metrics only...")
        else:
            print(f"Error fetching analytics: {e}")
            import traceback

            traceback.print_exc()
            return None

        # Fallback: fetch without CTR metrics
        try:
            analytics_data = fetch_video_analytics(
                analytics_service,
                video_id=video_id,
                start_date=start_date,
                end_date=end_date,
                metrics=standard_metrics,
                dimensions="day",
            )
        except Exception as e2:
            print(f"Error fetching analytics with standard metrics: {e2}")
            import traceback

            traceback.print_exc()
            return None

    # Calculate or extract CTR from the data if available
    if analytics_data:
        analytics_data = calculate_ctr_from_data(analytics_data, video_id)

    # Fetch relativeRetentionPerformance separately (cannot be queried with 'day' dimension)
    if analytics_data:
        try:
            print("Attempting to fetch relativeRetentionPerformance...")
            rrp_data = fetch_video_analytics(
                analytics_service,
                video_id=video_id,
                start_date=start_date,
                end_date=end_date,
                metrics="relativeRetentionPerformance",
                dimensions="video",  # Use 'video' dimension instead of 'day'
            )
            # Merge relativeRetentionPerformance into analytics_data metadata
            if rrp_data and rrp_data.get("rows"):
                if "metadata" not in analytics_data:
                    analytics_data["metadata"] = {}
                rrp_rows = rrp_data.get("rows", [])
                if rrp_rows and len(rrp_rows) > 0:
                    rrp_value = rrp_rows[0][0] if rrp_rows[0] else None
                    if rrp_value is not None:
                        analytics_data["metadata"][
                            "relativeRetentionPerformance"
                        ] = float(rrp_value)
                        print(
                            f"✓ relativeRetentionPerformance retrieved: {rrp_value}"
                        )
        except Exception as e:
            error_msg = str(e).lower()
            if "not supported" in error_msg or "invalid" in error_msg:
                print(f"⚠ relativeRetentionPerformance not available: {e}")
            else:
                print(f"⚠ Error fetching relativeRetentionPerformance: {e}")

    return analytics_data


def import_ctr_from_csv(csv_path: str | Path, video_id: str) -> dict | None:
    """Import CTR data from a CSV file exported from YouTube Studio.

    YouTube Studio CSV export format (Advanced Mode):
    - Date, Impressions, Impressions click-through rate (%), etc.

    Args:
        csv_path: Path to the CSV file exported from YouTube Studio
        video_id: Video ID to match (optional, for filtering)

    Returns:
        Dictionary with CTR data if found, None otherwise

    Example:
        ctr_data = import_ctr_from_csv("youtube_analytics.csv", "z3TsP4HSaaQ")
        if ctr_data:
            print(f"CTR: {ctr_data['average_ctr']}%")
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        print(f"CSV file not found: {csv_path}")
        return None

    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            # Try to detect delimiter
            sample = f.read(1024)
            f.seek(0)
            delimiter = "," if sample.count(",") > sample.count(";") else ";"

            reader = csv.DictReader(f, delimiter=delimiter)

            # Find columns for impressions and CTR
            impressions_col = None
            ctr_col = None

            # Common column name variations
            possible_impressions = [
                "Impressions",
                "impressions",
                "Impressions (unique)",
            ]
            possible_ctr = [
                "Impressions click-through rate (%)",
                "Impressions click-through rate",
                "CTR (%)",
                "CTR",
                "Click-through rate (%)",
                "Click-through rate",
            ]

            for header in reader.fieldnames or []:
                if header in possible_impressions:
                    impressions_col = header
                if header in possible_ctr:
                    ctr_col = header

            if not impressions_col or not ctr_col:
                print(
                    f"Could not find CTR columns in CSV. Found columns: {reader.fieldnames}"
                )
                print(
                    "Looking for: Impressions and 'Impressions click-through rate (%)'"
                )
                return None

            total_impressions = 0
            total_ctr = 0
            count = 0

            for row in reader:
                try:
                    impressions = (
                        int(row[impressions_col].replace(",", ""))
                        if row[impressions_col]
                        else 0
                    )
                    ctr_str = (
                        row[ctr_col].replace("%", "").replace(",", "").strip()
                    )
                    ctr = float(ctr_str) if ctr_str else 0

                    if impressions > 0:
                        total_impressions += impressions
                        total_ctr += ctr
                        count += 1
                except (ValueError, KeyError):
                    continue

            if count == 0:
                print("No CTR data found in CSV file")
                return None

            avg_ctr = total_ctr / count if count > 0 else 0

            return {
                "ctr_available": True,
                "source": "csv_import",
                "average_ctr": round(avg_ctr, 2),
                "total_impressions": total_impressions,
                "days_with_data": count,
                "note": "CTR imported from YouTube Studio CSV export",
            }

    except Exception as e:
        print(f"Error reading CSV file: {e}")
        import traceback

        traceback.print_exc()
        return None


def merge_ctr_into_analytics(analytics_data: dict, ctr_data: dict) -> dict:
    """Merge CTR data from CSV import into analytics data.

    Args:
        analytics_data: Analytics data dictionary from API
        ctr_data: CTR data dictionary from CSV import

    Returns:
        Updated analytics data dictionary with CTR merged
    """
    if "metadata" not in analytics_data:
        analytics_data["metadata"] = {}

    analytics_data["metadata"]["ctr_available"] = True
    analytics_data["metadata"]["ctr_source"] = "csv_import"
    analytics_data["metadata"]["average_ctr"] = ctr_data.get("average_ctr")
    analytics_data["metadata"]["total_impressions"] = ctr_data.get(
        "total_impressions"
    )
    analytics_data["metadata"]["days_with_ctr_data"] = ctr_data.get(
        "days_with_data"
    )

    return analytics_data


def calculate_vv7(analytics_data: dict, published_date: str) -> float | None:
    """Calculate View Velocity 7d (VV7) - sum of views from days 0-6 after publish.

    Args:
        analytics_data: Analytics data dictionary with daily metrics
        published_date: Video publish date in YYYY-MM-DD format

    Returns:
        VV7 value (sum of views from first 7 days), or None if insufficient data
    """
    rows = analytics_data.get("rows", [])
    column_headers = analytics_data.get("columnHeaders", [])
    metric_indices = _get_metric_indices(column_headers)

    if "views" not in metric_indices:
        return None

    views_idx = metric_indices["views"]
    date_idx = None

    # Find date dimension index
    for i, header in enumerate(column_headers):
        if (
            header.get("columnType") == "DIMENSION"
            and header.get("name") == "day"
        ):
            date_idx = i
            break

    if date_idx is None:
        return None

    # Parse published date
    try:
        pub_date = datetime.strptime(published_date, "%Y-%m-%d")
    except ValueError:
        return None

    vv7 = 0
    days_counted = 0

    for row in rows:
        if len(row) <= max(views_idx, date_idx):
            continue

        try:
            row_date_str = row[date_idx]
            row_date = datetime.strptime(row_date_str, "%Y-%m-%d")
            days_since_publish = (row_date - pub_date).days

            # Count views from days 0-6 (first 7 days)
            if 0 <= days_since_publish <= 6:
                views = int(row[views_idx]) if row[views_idx] else 0
                vv7 += views
                days_counted += 1
        except (ValueError, TypeError, IndexError):
            continue

    # Return None only if no data available for days 0-6
    # Return 0.0 if we have data but all views are 0 (valid case)
    if days_counted == 0:
        return None
    return float(vv7)


def calculate_avp(analytics_data: dict) -> float | None:
    """Calculate Average View Percentage (AVP).

    Args:
        analytics_data: Analytics data dictionary with averageViewPercentage metric

    Returns:
        AVP value (0-1 range), or None if not available
    """
    column_headers = analytics_data.get("columnHeaders", [])
    metric_indices = _get_metric_indices(column_headers)

    if "averageViewPercentage" not in metric_indices:
        return None

    avp_idx = metric_indices["averageViewPercentage"]
    rows = analytics_data.get("rows", [])

    # Get the most recent non-zero AVP value
    for row in reversed(rows):
        if len(row) > avp_idx:
            try:
                avp_value = float(row[avp_idx]) if row[avp_idx] else None
                if avp_value is not None and avp_value > 0:
                    return avp_value / 100.0  # Convert percentage to 0-1 range
            except (ValueError, TypeError):
                continue

    return None


def calculate_ehs(analytics_data: dict) -> float | None:
    """Calculate Early Hook Score (EHS) from relativeRetentionPerformance.

    Uses YouTube's relativeRetentionPerformance metric which is already normalized to
    "average performance for videos of similar length." This metric represents retention
    performance relative to similar videos and can be used directly (0-100 scale).

    For early channels (< 5 videos), relativeRetentionPerformance is used directly.
    For established channels (≥ 5 videos), it's z-scored against channel history.

    Args:
        analytics_data: Analytics data dictionary with relativeRetentionPerformance metric
                       (may be in metadata if fetched separately, or in rows if available)

    Returns:
        EHS value (0-100 scale from relativeRetentionPerformance), or None if not available
    """
    # First check if relativeRetentionPerformance is in metadata (fetched separately)
    metadata = analytics_data.get("metadata", {})
    if "relativeRetentionPerformance" in metadata:
        rrp_value = metadata["relativeRetentionPerformance"]
        if rrp_value is not None:
            return max(0.0, min(100.0, float(rrp_value)))

    # Otherwise, check if it's in the rows (if queried with compatible dimensions)
    column_headers = analytics_data.get("columnHeaders", [])
    metric_indices = _get_metric_indices(column_headers)

    if "relativeRetentionPerformance" not in metric_indices:
        return None

    rrp_idx = metric_indices["relativeRetentionPerformance"]
    rows = analytics_data.get("rows", [])

    # Get the most recent non-zero relativeRetentionPerformance value
    # This metric is already normalized (0-100) by YouTube
    for row in reversed(rows):
        if len(row) > rrp_idx:
            try:
                rrp_value = float(row[rrp_idx]) if row[rrp_idx] else None
                if rrp_value is not None:
                    # relativeRetentionPerformance is already on 0-100 scale
                    # Clamp to ensure it's within expected range
                    return max(0.0, min(100.0, rrp_value))
            except (ValueError, TypeError):
                continue

    return None


def calculate_spv(
    analytics_data: dict, published_date: str, views_28d: int | None = None
) -> float | None:
    """Calculate Subscribers per 1K Views (SPV).

    SPV = (subsGained - subsLost) / views_28d * 1000

    Args:
        analytics_data: Analytics data dictionary with subscriber metrics
        published_date: Video publish date in YYYY-MM-DD format
        views_28d: Total views in first 28 days (if None, will calculate from daily data)

    Returns:
        SPV value, or None if insufficient data
    """
    column_headers = analytics_data.get("columnHeaders", [])
    metric_indices = _get_metric_indices(column_headers)
    rows = analytics_data.get("rows", [])

    has_subs_gained = "subscribersGained" in metric_indices
    has_subs_lost = "subscribersLost" in metric_indices
    has_views = "views" in metric_indices

    if not has_subs_gained:
        return None

    subs_gained_idx = metric_indices["subscribersGained"]
    subs_lost_idx = metric_indices["subscribersLost"] if has_subs_lost else None
    views_idx = metric_indices["views"] if has_views else None

    # Find date dimension index
    date_idx = None
    for i, header in enumerate(column_headers):
        if (
            header.get("columnType") == "DIMENSION"
            and header.get("name") == "day"
        ):
            date_idx = i
            break

    # Parse published date
    try:
        pub_date = datetime.strptime(published_date, "%Y-%m-%d")
    except ValueError:
        return None

    total_subs_gained = 0
    total_subs_lost = 0
    views_28d_calculated = 0

    # Sum subscribers gained/lost and views from first 28 days
    # Date dimension is required for proper filtering
    if date_idx is None:
        return None

    for row in rows:
        # Validate date and check if row is within 28-day window
        if len(row) <= date_idx:
            continue

        try:
            row_date_str = row[date_idx]
            row_date = datetime.strptime(row_date_str, "%Y-%m-%d")
            days_since_publish = (row_date - pub_date).days

            # Only count metrics from first 28 days (days 0-27)
            if days_since_publish < 0 or days_since_publish > 27:
                continue
        except (ValueError, TypeError, IndexError):
            # Skip rows with invalid dates
            continue

        # Accumulate metrics only for rows that passed date validation
        try:
            if len(row) > subs_gained_idx:
                subs_gained = (
                    int(row[subs_gained_idx]) if row[subs_gained_idx] else 0
                )
                total_subs_gained += subs_gained

            if subs_lost_idx and len(row) > subs_lost_idx:
                subs_lost = int(row[subs_lost_idx]) if row[subs_lost_idx] else 0
                total_subs_lost += subs_lost

            if views_idx and len(row) > views_idx:
                views = int(row[views_idx]) if row[views_idx] else 0
                views_28d_calculated += views
        except (ValueError, TypeError):
            continue

    # Use provided views_28d or calculated value
    if views_28d is None:
        views_28d = views_28d_calculated

    if views_28d is None or views_28d == 0:
        return None

    net_subs = total_subs_gained - total_subs_lost
    spv = (net_subs / views_28d) * 1000

    return float(spv)


def calculate_z_score(value: float, mean: float, std_dev: float) -> float:
    """Calculate z-score for normalization.

    Args:
        value: The value to normalize
        mean: Mean of the baseline distribution
        std_dev: Standard deviation of the baseline distribution

    Returns:
        Z-score value
    """
    if std_dev == 0:
        return 0.0
    return (value - mean) / std_dev


def normalize_to_0_100(
    z_score: float, min_z: float = -3.0, max_z: float = 3.0
) -> float:
    """Normalize z-score to 0-100 range.

    Args:
        z_score: Z-score value
        min_z: Minimum expected z-score (default: -3)
        max_z: Maximum expected z-score (default: 3)

    Returns:
        Normalized value in 0-100 range
    """
    # Clamp z-score to expected range
    clamped_z = max(min_z, min(max_z, z_score))
    # Normalize to 0-100
    normalized = ((clamped_z - min_z) / (max_z - min_z)) * 100
    return max(0.0, min(100.0, normalized))


def calculate_sgi(
    analytics_data: dict,
    video: dict,
    baseline_data: list[dict] | None = None,
    channel_video_count: int | None = None,
) -> dict:
    """Calculate Storyloop Growth Index (SGI) score.

    SGI is a CTR-free Expected Satisfied Watch Time per Impression metric that measures
    video performance across Discovery (40%), RetentionQuality (45%), and Loyalty (15%).

    Formula: SGI = 0.40 * Discovery + 0.45 * RetentionQuality + 0.15 * Loyalty

    Components:
        - Discovery: View Velocity 7d (VV7) - sum of views from first 7 days
        - RetentionQuality: Uses relativeRetentionPerformance (YouTube's normalized metric).
          For early channels (< 5 videos): retention_quality = 0.6*AVP + 0.4*EHS (absolute, not z-scored)
          For established channels (≥ 5 videos): retention_quality = z(0.6*AVP + 0.4*EHS)
          EHS uses relativeRetentionPerformance which is already normalized to similar-length videos.
        - Loyalty: Subscribers per 1K Views (SPV) = (subsGained - subsLost) / views_28d * 1000

    Reading Results:
        - sgi_scaled: Final score (0-100), higher is better
        - discovery_score, retention_score, loyalty_score: Individual component scores (0-100)
        - components: Raw values (vv7, avp, ehs, spv) before normalization
        - note: Calculation mode (early channel vs established channel with z-scores)

    For detailed formulas and methodology, see: thinking/insights.md

    Args:
        analytics_data: YouTube Analytics API data with daily metrics (views, averageViewPercentage,
                       subscribersGained, subscribersLost, relativeRetentionPerformance, day dimension)
        video: Video dict with id and snippet.publishedAt
        baseline_data: Optional historical video data for z-score calculation (None = prototype mode)
        channel_video_count: Number of videos on the channel (used to determine early vs established)

    Returns:
        Dict with components (raw values), discovery_score, retention_score, loyalty_score,
        sgi_raw, sgi_scaled (0-100), and note (calculation mode).
    """
    snippet = video.get("snippet", {})
    published_at = (
        snippet.get("publishedAt", "") if isinstance(snippet, dict) else ""
    )
    published_date = published_at.split("T")[0] if published_at else None

    if not published_date:
        return {
            "error": "Video publish date not available",
            "sgi": None,
        }

    # Calculate raw component values for SGI score
    # Discovery component: View Velocity 7d (VV7) - sum of views from first 7 days
    vv7 = calculate_vv7(analytics_data, published_date)
    # Retention component: Average View Percentage (AVP) - how much of video viewers watch
    avp = calculate_avp(analytics_data)
    # Retention component: Early Hook Score (EHS) - retention performance in opening sections
    # May be None if retention curve data not available via API
    ehs = calculate_ehs(analytics_data)
    # Loyalty component: Subscribers per 1K Views (SPV) - conversion rate to subscribers
    spv = calculate_spv(analytics_data, published_date)

    components = {
        "vv7": vv7,
        "avp": avp,
        "ehs": ehs,
        "spv": spv,
    }

    # Determine if this is an early channel (< 5 videos) or established channel
    # For early channels, use relativeRetentionPerformance directly (already normalized by YouTube)
    # For established channels, use z-scores against channel history
    is_early_channel = (
        channel_video_count is not None and channel_video_count < 5
    )

    # For prototyping without baseline, use simple normalization
    # In production, these would be z-scores against historical data
    if baseline_data is None or len(baseline_data) == 0:
        # Calculate raw component values
        discovery_raw = vv7 if vv7 is not None else None

        # RetentionQuality: 0.6 * AVP + 0.4 * EHS
        # EHS uses relativeRetentionPerformance (0-100 scale, already normalized by YouTube)
        # For early channels: use absolute values (relativeRetentionPerformance is the baseline)
        # For established channels: would use z-scores (when baseline_data is available)
        if avp is not None:
            if ehs is not None:
                # EHS is already on 0-100 scale from relativeRetentionPerformance
                # Convert AVP (0-1) to 0-100 scale for consistency
                avp_scaled = avp * 100
                retention_raw = 0.6 * avp_scaled + 0.4 * ehs
            else:
                # When EHS unavailable, use only AVP component (0.6 weight)
                retention_raw = 0.6 * avp * 100
        else:
            # When AVP unavailable but EHS is available, use EHS as proxy for retention quality
            # EHS represents retention performance relative to similar videos, so it's a reasonable fallback
            if ehs is not None:
                retention_raw = (
                    ehs  # Use EHS directly as proxy (already 0-100 scale)
                )
            else:
                retention_raw = None

        loyalty_raw = spv if spv is not None else None

        # Normalize to 0-100 using reasonable assumptions for prototype
        # These are rough estimates - in production, use z-scores against baseline

        # Discovery: VV7 typically ranges from hundreds to millions
        # Assume reasonable range: 0-100k views in 7 days maps to 0-100
        if discovery_raw is not None:
            # Use log scale for discovery (views can vary widely)
            if discovery_raw > 0:
                discovery_z = (
                    discovery_raw / 10000.0 - 1.0
                ) / 2.0  # Rough z-score proxy
            else:
                discovery_z = -2.0
            discovery_score = normalize_to_0_100(discovery_z)
        else:
            discovery_score = 0.0

        # Retention: retention_raw is already on 0-100 scale (from AVP*100 + EHS)
        # For early channels: use directly (relativeRetentionPerformance is the baseline)
        # For established channels: would z-score against channel history
        if retention_raw is not None:
            if is_early_channel:
                # Early channel: use absolute value directly (relativeRetentionPerformance baseline)
                retention_score = max(0.0, min(100.0, retention_raw))
            else:
                # Established channel: use rough z-score proxy (would use real z-score with baseline)
                retention_z = (
                    retention_raw - 50.0
                ) / 20.0  # Rough z-score proxy
                retention_score = normalize_to_0_100(retention_z)
        else:
            retention_score = 0.0

        # Loyalty: SPV typically ranges from -10 to +50 per 1K views
        # Assume reasonable range: -5 to +20 maps to 0-100
        if loyalty_raw is not None:
            loyalty_z = (loyalty_raw - 7.5) / 5.0  # Rough z-score proxy
            loyalty_score = normalize_to_0_100(loyalty_z)
        else:
            loyalty_score = 0.0

        # Calculate weighted SGI
        sgi_raw = (
            0.40 * discovery_score
            + 0.45 * retention_score
            + 0.15 * loyalty_score
        )
        sgi_scaled = max(0.0, min(100.0, sgi_raw))

        return {
            "components": components,
            "discovery_score": round(discovery_score, 2),
            "retention_score": round(retention_score, 2),
            "loyalty_score": round(loyalty_score, 2),
            "sgi_raw": round(sgi_raw, 2),
            "sgi_scaled": round(sgi_scaled, 2),
            "note": f"Scores calculated without baseline (prototype mode). {'Early channel mode: using relativeRetentionPerformance directly as baseline.' if is_early_channel else 'Established channel: would use z-scores against historical video data.'}",
        }

    # TODO: Implement proper z-score calculation against baseline_data
    # This would require calculating mean/std for each component from baseline
    return {
        "components": components,
        "note": "Baseline z-score calculation not yet implemented",
    }


def main():
    """Main entry point for the script."""
    # When running locally, disable OAuthlib's HTTPs verification.
    # When running in production *do not* leave this option enabled.
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

    service = get_authenticated_service()

    # Get channel details
    channel = get_channel_details(service)

    # Get latest video and calculate SGI score
    video = list_latest_long_form_video(service)
    sgi_score = None

    if video and video.get("id"):
        # Fetch analytics for the video
        analytics_data = fetch_video_analytics_data(video)

        if analytics_data:
            # Calculate SGI score
            sgi_result = calculate_sgi(
                analytics_data, video, channel_video_count=None
            )
            if "error" not in sgi_result:
                sgi_score = sgi_result.get("sgi_scaled")

    # Display channel with score
    if channel:
        print("Channel:")
        print("-" * 80)
        print(f"Channel: {channel['channel_title']}")
        print(f"  ID: {channel['channel_id']}")
        print(f"  URL: {channel['channel_url']}")
        if channel["channel_thumbnail_url"]:
            print(f"  Thumbnail: {channel['channel_thumbnail_url']}")
        if channel["channel_updated_at"]:
            print(f"  Updated: {channel['channel_updated_at']}")
        if sgi_score is not None:
            print(f"  SGI Score: {sgi_score:.2f}/100")
        print()
    else:
        print("No channel found.")


if __name__ == "__main__":
    main()
