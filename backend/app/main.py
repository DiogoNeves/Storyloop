"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager, closing
from typing import AsyncContextManager, AsyncIterator, Callable, Literal

import logfire
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import Settings, settings
from app.db import SqliteConnectionFactory, create_connection_factory
from app.db_helpers.conversations import init_conversation_tables
from app.routers import api_router
from app.scheduler import create_scheduler
from app.services import (
    EntryService,
    GrowthScoreService,
    UserService,
    YoutubeOAuthService,
    YoutubeService,
    build_agent,
)
from app.services.youtube import YoutubeConfigurationError

logger = logging.getLogger(__name__)


try:  # pragma: no cover - optional dependency until demo mode ships
    from app.services.youtube_demo import DemoYoutubeService
except (
    ImportError
):  # pragma: no cover - fallback when demo service not yet available
    DemoYoutubeService = None  # type: ignore[assignment]


def configure_logfire(active_settings: Settings) -> None:
    """Initialize Logfire observability."""
    send_to_logfire_value: Literal["if-token-present"] = "if-token-present"
    if active_settings.logfire_api_key:
        logfire.configure(
            service_name="storyloop-backend",
            send_to_logfire=send_to_logfire_value,
            token=active_settings.logfire_api_key,
        )
    else:
        logfire.configure(
            service_name="storyloop-backend",
            send_to_logfire=send_to_logfire_value,
        )


def build_lifespan(
    active_settings: Settings, connection_factory: SqliteConnectionFactory
) -> Callable[[FastAPI], AsyncContextManager[None]]:
    """Create the FastAPI lifespan handler for scheduler management."""

    user_service = UserService(connection_factory)
    user_service.ensure_schema()
    entry_service = EntryService(connection_factory)
    entry_service.ensure_schema()

    # Initialize conversation tables
    with closing(connection_factory()) as connection:
        init_conversation_tables(connection)

    youtube_service: YoutubeService | None = None
    demo_youtube_service = None
    if active_settings.youtube_demo_mode:
        if DemoYoutubeService is None:
            raise RuntimeError(
                "YouTube demo mode requested but DemoYoutubeService is unavailable."
            )
        demo_youtube_service = DemoYoutubeService(
            scenario=active_settings.youtube_demo_scenario
        )
        resolved_youtube_service = demo_youtube_service
    else:
        youtube_service = YoutubeService(
            api_key=active_settings.youtube_api_key
        )
        resolved_youtube_service = youtube_service

    growth_score_service = GrowthScoreService()

    # Initialize AI agent (optional, returns None if OPENAI_API_KEY not set)
    assistant_agent = build_agent(active_settings)

    scheduler: AsyncIOScheduler | None = None

    if active_settings.scheduler_enabled:
        scheduler = create_scheduler(
            youtube_sync_job=resolved_youtube_service.sync_latest_metrics,
            growth_score_job=growth_score_service.recalculate_growth_score,
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = active_settings
        app.state.get_db = connection_factory
        app.state.entry_service = entry_service
        app.state.user_service = user_service
        app.state.youtube_service = youtube_service or resolved_youtube_service
        app.state.youtube_demo_service = demo_youtube_service
        app.state.active_youtube_service = resolved_youtube_service
        app.state.youtube_demo_mode = active_settings.youtube_demo_mode
        try:
            app.state.youtube_oauth_service = YoutubeOAuthService(
                active_settings
            )
        except YoutubeConfigurationError:
            app.state.youtube_oauth_service = None
        app.state.growth_score_service = growth_score_service
        app.state.assistant_agent = assistant_agent

        demo_mode_enabled = active_settings.youtube_demo_mode
        demo_mode_details = "disabled"
        if demo_mode_enabled:
            scenario = active_settings.youtube_demo_scenario or "default"
            demo_mode_details = f"enabled (scenario={scenario})"

        if demo_mode_enabled:
            db_log_level = logging.WARNING
            db_message = (
                "Using demo database: %s (demo mode prevents writes to production database)"
            )
        else:
            db_log_level = logging.INFO
            db_message = "Connected to primary database at %s"

        logger.log(
            db_log_level,
            db_message,
            active_settings.effective_database_url,
        )
        logger.info(
            "Application configured for %s environment with YouTube demo mode %s",
            active_settings.environment,
            demo_mode_details,
        )

        if scheduler is not None:
            app.state.scheduler = scheduler
            scheduler.start()
            logger.info(
                "Scheduler started with %d jobs (YouTube demo mode: %s)",
                len(scheduler.get_jobs()),
                demo_mode_details,
            )
        else:
            logger.info(
                "Scheduler disabled for %s environment (YouTube demo mode: %s)",
                active_settings.environment,
                demo_mode_details,
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
    # Use demo database when demo mode is enabled to avoid polluting the real database
    database_url = resolved_settings.effective_database_url
    connection_factory = create_connection_factory(database_url)

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
