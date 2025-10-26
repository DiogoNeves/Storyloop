"""YouTube ingestion service placeholders."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from ..config import settings

logger = logging.getLogger(__name__)


@dataclass
class YoutubeService:
    """Placeholder service for future YouTube integrations."""

    api_key: str | None = settings.youtube_api_key

    def sync_latest_metrics(self) -> None:
        """Log a placeholder message to confirm wiring."""
        if not self.api_key:
            logger.info("YouTube API key not configured; skipping sync placeholder.")
            return
        logger.info("Pretending to sync YouTube metrics with API key ending %s", self.api_key[-4:])
