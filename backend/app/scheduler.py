"""APScheduler configuration for recurring Storyloop jobs."""

from __future__ import annotations

import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)


def _log_job_run(job_name: str) -> None:
    timestamp = datetime.utcnow().isoformat()
    logger.info("%s executed at %s", job_name, timestamp)


def collect_youtube_metrics() -> None:
    """Placeholder job for collecting YouTube metrics."""
    _log_job_run("collect_youtube_metrics")


def recalculate_growth_score() -> None:
    """Placeholder job for recalculating the Storyloop Growth Score."""
    _log_job_run("recalculate_growth_score")


def create_scheduler() -> AsyncIOScheduler:
    """Configure and return the APScheduler instance with placeholder jobs."""
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        collect_youtube_metrics,
        trigger="cron",
        day_of_week="sun",
        hour=3,
        minute=0,
        id="weekly-youtube-sync",
        replace_existing=True,
    )
    scheduler.add_job(
        recalculate_growth_score,
        trigger="cron",
        hour=1,
        minute=0,
        id="daily-growth-score",
        replace_existing=True,
    )
    return scheduler
