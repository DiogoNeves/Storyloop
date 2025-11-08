"""Service for fetching YouTube data for the authenticated linked account."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from app.services.youtube import YoutubeConfigurationError, YoutubeService, YoutubeVideo
from app.utils.youtube_video import extract_channel_fields

if TYPE_CHECKING:
    from app.services.users import UserService
    from app.services.youtube_oauth import YoutubeOAuthService

logger = logging.getLogger(__name__)


class YoutubeAccountService:
    """Service for fetching YouTube channel and video data for authenticated users."""

    def __init__(
        self,
        *,
        user_service: "UserService",
        youtube_service: YoutubeService,
        oauth_service: "YoutubeOAuthService",
    ) -> None:
        self._user_service = user_service
        self._youtube_service = youtube_service
        self._oauth_service = oauth_service
        self._client: Any | None = None

    def _get_authenticated_client(self) -> Any:
        """Get or build an authenticated YouTube API client."""
        if self._client is None:
            self._client = self._youtube_service.build_authenticated_client(
                self._user_service, self._oauth_service
            )
        return self._client

    def fetch_and_persist_channel_info(self) -> dict[str, Any] | None:
        """Fetch channel info from YouTube API and persist it.

        Returns:
            Dictionary with channel fields matching UserRecord schema, or None if fetch fails
        """
        try:
            client = self._get_authenticated_client()
            channel_response = (
                client.channels()
                .list(part="id,snippet,contentDetails", mine=True, maxResults=1)
                .execute()
            )

            items = channel_response.get("items", [])
            if not items:
                logger.warning("No channel found for authenticated user")
                return None

            channel_item = items[0]
            channel_fields = extract_channel_fields(channel_item)

            if channel_fields is None:
                logger.warning("Failed to extract channel fields from API response")
                return None

            # Persist channel info
            self._user_service.update_channel_info(
                channel_id=channel_fields["channel_id"],
                channel_title=channel_fields.get("channel_title"),
                channel_url=channel_fields.get("channel_url"),
                thumbnail_url=channel_fields.get("channel_thumbnail_url"),
                updated_at=channel_fields.get("channel_updated_at") or datetime.now(tz=UTC),
            )

            return channel_fields
        except YoutubeConfigurationError:
            raise
        except Exception as exc:
            logger.exception("Failed to fetch channel info: %s", exc)
            return None

    def fetch_channel_videos(self, *, max_results: int = 50) -> list[YoutubeVideo]:
        """Fetch videos from the authenticated user's uploads playlist.

        Args:
            max_results: Maximum number of videos to return

        Returns:
            List of YoutubeVideo objects, classified by type (short/live/video)
        """
        try:
            client = self._get_authenticated_client()

            # Get channel to find uploads playlist
            channel_response = (
                client.channels()
                .list(part="contentDetails", mine=True, maxResults=1)
                .execute()
            )

            items = channel_response.get("items", [])
            if not items:
                logger.warning("No channel found for authenticated user")
                return []

            uploads_playlist_id = (
                items[0]
                .get("contentDetails", {})
                .get("relatedPlaylists", {})
                .get("uploads")
            )

            if not uploads_playlist_id:
                logger.warning("Channel missing uploads playlist")
                return []

            # Fetch playlist items
            playlist_items: list[dict[str, Any]] = []
            page_token: str | None = None

            while len(playlist_items) < max_results:
                playlist_response = (
                    client.playlistItems()
                    .list(
                        part="snippet,contentDetails",
                        playlistId=uploads_playlist_id,
                        maxResults=min(50, max_results),
                        pageToken=page_token,
                    )
                    .execute()
                )

                batch_items = playlist_response.get("items", [])
                if not batch_items:
                    break

                playlist_items.extend(batch_items)
                page_token = playlist_response.get("nextPageToken")

                if len(playlist_items) >= max_results or not page_token:
                    break

            if not playlist_items:
                return []

            # Extract video IDs
            video_ids: list[str] = []
            for item in playlist_items[:max_results]:
                snippet = item.get("snippet", {})
                resource_id = snippet.get("resourceId", {})
                video_id = resource_id.get("videoId")
                if video_id:
                    video_ids.append(video_id)

            if not video_ids:
                return []

            # Fetch full video details with metadata for classification
            videos_response = (
                client.videos()
                .list(
                    part="contentDetails,fileDetails,snippet,status",
                    id=",".join(video_ids),
                    maxResults=len(video_ids),
                )
                .execute()
            )

            video_items = videos_response.get("items", [])
            if not video_items:
                return []

            # Build a map of video_id -> full video data
            video_map: dict[str, dict[str, Any]] = {}
            for video_item in video_items:
                video_id = video_item.get("id")
                if video_id:
                    video_map[video_id] = video_item

            # Build YoutubeVideo objects from playlist items, enriching with full video data
            videos: list[YoutubeVideo] = []
            for item in playlist_items[:max_results]:
                snippet = item.get("snippet", {})
                resource_id = snippet.get("resourceId", {})
                video_id = resource_id.get("videoId")

                if not video_id:
                    continue

                # Enrich playlist item with full video data
                full_video_data = video_map.get(video_id, {})
                if full_video_data:
                    # Merge contentDetails and fileDetails from full video data
                    item["contentDetails"] = full_video_data.get("contentDetails", {})
                    item["fileDetails"] = full_video_data.get("fileDetails", {})
                    # Update snippet with any additional fields from full video
                    full_snippet = full_video_data.get("snippet", {})
                    if full_snippet:
                        item["snippet"].update(full_snippet)

                video = YoutubeVideo.from_playlist_item(item)
                if video is not None:
                    videos.append(video)

            return videos
        except YoutubeConfigurationError:
            raise
        except Exception as exc:
            logger.exception("Failed to fetch channel videos: %s", exc)
            return []

