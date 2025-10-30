"""DateTime parsing utilities for ISO 8601 formats."""

import logging
import re
from datetime import datetime

logger = logging.getLogger(__name__)


def parse_datetime(value: str | None) -> datetime:
    """Parse ISO 8601 timestamps.

    Args:
        value: ISO 8601 timestamp string, may end with 'Z' for UTC

    Returns:
        Parsed datetime object

    Raises:
        ValueError: If value is missing or invalid
    """
    if not value:
        raise ValueError("Timestamp missing")
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def parse_duration_seconds(duration: str | None) -> int | None:
    """Parse ISO 8601 duration format to seconds.

    Examples:
        "PT1M30S" -> 90
        "PT60S" -> 60
        "PT1H" -> 3600

    Args:
        duration: ISO 8601 duration string (e.g., "PT1M30S")

    Returns:
        Duration in seconds, or None if duration is empty or invalid
    """
    if not duration:
        return None
    # ISO 8601 duration format: PT[nH][nM][nS]
    # Remove "PT" prefix
    if not duration.startswith("PT"):
        logger.warning("Unexpected duration format: %s", duration)
        return None
    duration_str = duration[2:]
    total_seconds = 0
    # Parse hours, minutes, seconds
    hours_match = re.search(r"(\d+)H", duration_str)
    minutes_match = re.search(r"(\d+)M", duration_str)
    seconds_match = re.search(r"(\d+)S", duration_str)
    if hours_match:
        total_seconds += int(hours_match.group(1)) * 3600
    if minutes_match:
        total_seconds += int(minutes_match.group(1)) * 60
    if seconds_match:
        total_seconds += int(seconds_match.group(1))
    return total_seconds

