"""APScheduler configuration for recurring Storyloop jobs."""

from __future__ import annotations

from collections.abc import Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler


def create_scheduler(
    *,
    youtube_sync_job: Callable[[], None],
    growth_score_job: Callable[[], None],
) -> AsyncIOScheduler:
    """Configure and return the APScheduler instance with injected jobs."""

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        youtube_sync_job,
        trigger="cron",
        day_of_week="sun",
        hour=3,
        minute=0,
        id="weekly-youtube-sync",
        replace_existing=True,
    )
    scheduler.add_job(
        growth_score_job,
        trigger="cron",
        hour=1,
        minute=0,
        id="daily-growth-score",
        replace_existing=True,
    )
    return scheduler
