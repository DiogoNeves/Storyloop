"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator, Callable

import logfire
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .config import Settings, settings
from .db import SqliteConnectionFactory, create_connection_factory
from .routers import api_router
from .scheduler import create_scheduler
from .schema import ensure_schema
from .services import GrowthScoreService, YoutubeService

logger = logging.getLogger(__name__)


def configure_logfire(active_settings: Settings) -> None:
    """Initialize Logfire observability."""
    kwargs = {
        "service_name": "storyloop-backend",
        "send_to_logfire": "if-token-present",
    }
    if active_settings.logfire_api_key:
        kwargs["token"] = active_settings.logfire_api_key
    logfire.configure(**kwargs)


def build_lifespan(
    active_settings: Settings, connection_factory: SqliteConnectionFactory
) -> Callable[[FastAPI], AsyncIterator[None]]:
    """Create the FastAPI lifespan handler for scheduler management."""

    youtube_service = YoutubeService(api_key=active_settings.youtube_api_key)
    growth_score_service = GrowthScoreService()
    scheduler: AsyncIOScheduler | None = None

    if active_settings.scheduler_enabled:
        scheduler = create_scheduler(
            youtube_sync_job=youtube_service.sync_latest_metrics,
            growth_score_job=growth_score_service.recalculate_growth_score,
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = active_settings
        app.state.get_db = connection_factory
        app.state.youtube_service = youtube_service
        app.state.growth_score_service = growth_score_service

        # Initialize database schema for non-test databases
        if not active_settings.database_url.endswith(":memory:"):
            conn = connection_factory()
            try:
                ensure_schema(conn)
                logger.info("Database schema initialized")
            finally:
                conn.close()

        if scheduler is not None:
            app.state.scheduler = scheduler
            scheduler.start()
            logger.info("Scheduler started with %d jobs", len(scheduler.get_jobs()))
        else:
            logger.info(
                "Scheduler disabled for %s environment", active_settings.environment
            )
        try:
            yield
        finally:
            if scheduler is not None:
                scheduler.shutdown(wait=False)
                logger.info("Scheduler shutdown complete")

    return lifespan


def create_app(active_settings: Settings | None = None) -> FastAPI:
    """Build and configure the FastAPI application instance."""
    logging.basicConfig(level=logging.INFO)
    resolved_settings = active_settings or settings
    configure_logfire(resolved_settings)
    connection_factory = create_connection_factory(resolved_settings.database_url)

    application = FastAPI(
        title="Storyloop API",
        version="0.1.0",
        lifespan=build_lifespan(resolved_settings, connection_factory),
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(api_router)
    return application


app = create_app()
