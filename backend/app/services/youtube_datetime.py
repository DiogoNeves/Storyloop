"""Pure parsers for YouTube date and duration payload fields."""

from __future__ import annotations

import logging
import re
from datetime import datetime

logger = logging.getLogger(__name__)


def parse_youtube_published_at(value: str | None) -> datetime:
    """Parse a YouTube `publishedAt` ISO 8601 timestamp."""
    if not value:
        raise ValueError("Timestamp missing")
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def parse_youtube_duration_seconds(duration: str | None) -> int | None:
    """Parse a YouTube ISO 8601 duration into total seconds."""
    if not duration:
        return None
    if not duration.startswith("P"):
        logger.warning("Unexpected duration format: %s", duration)
        return None

    duration_str = duration[1:]
    total_seconds = 0

    days_match = re.search(r"(\d+)D", duration_str)
    if days_match:
        total_seconds += int(days_match.group(1)) * 86400

    if "T" in duration_str:
        time_str = duration_str.split("T")[1]
        hours_match = re.search(r"(\d+)H", time_str)
        minutes_match = re.search(r"(\d+)M", time_str)
        seconds_match = re.search(r"(\d+)S", time_str)

        if hours_match:
            total_seconds += int(hours_match.group(1)) * 3600
        if minutes_match:
            total_seconds += int(minutes_match.group(1)) * 60
        if seconds_match:
            total_seconds += int(seconds_match.group(1))

    return total_seconds
