"""YouTube ingestion service."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ..config import settings

logger = logging.getLogger(__name__)


@dataclass
class YoutubeService:
    """Service for YouTube Data API integrations."""

    api_key: str | None = settings.youtube_api_key

    def sync_latest_metrics(self) -> None:
        """Log a placeholder message to confirm wiring."""
        if not self.api_key:
            logger.info("YouTube API key not configured; skipping sync placeholder.")
            return
        logger.info("Pretending to sync YouTube metrics with API key ending %s", self.api_key[-4:])

    def get_channel_videos(self, channel_id: str, max_results: int = 50) -> list[dict]:
        """
        Fetch videos from a YouTube channel.

        Args:
            channel_id: The YouTube channel ID
            max_results: Maximum number of videos to fetch per page (max 50)

        Returns:
            List of video dictionaries with id, title, description, publishedAt, thumbnails

        Raises:
            ValueError: If API key is not configured or channel_id is invalid
            HttpError: If YouTube API request fails
        """
        if not self.api_key:
            raise ValueError("YouTube API key not configured")

        if not channel_id:
            raise ValueError("Channel ID is required")

        try:
            youtube = build("youtube", "v3", developerKey=self.api_key)

            # Step 1: Get the channel's uploads playlist ID
            channels_response = youtube.channels().list(
                part="contentDetails",
                id=channel_id
            ).execute()

            if not channels_response.get("items"):
                raise ValueError(f"Channel not found: {channel_id}")

            uploads_playlist_id = channels_response["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

            # Step 2: Get videos from the uploads playlist
            videos = []
            next_page_token = None

            while True:
                playlist_response = youtube.playlistItems().list(
                    part="snippet",
                    playlistId=uploads_playlist_id,
                    maxResults=min(max_results, 50),
                    pageToken=next_page_token
                ).execute()

                for item in playlist_response.get("items", []):
                    snippet = item["snippet"]
                    videos.append({
                        "id": snippet["resourceId"]["videoId"],
                        "title": snippet["title"],
                        "description": snippet["description"],
                        "publishedAt": snippet["publishedAt"],
                        "thumbnails": snippet.get("thumbnails", {}),
                    })

                next_page_token = playlist_response.get("nextPageToken")

                # Stop if no more pages or we've reached the max_results
                if not next_page_token or len(videos) >= max_results:
                    break

            logger.info("Fetched %d videos from channel %s", len(videos), channel_id)
            return videos[:max_results]

        except HttpError as e:
            logger.error("YouTube API error: %s", e)
            raise
