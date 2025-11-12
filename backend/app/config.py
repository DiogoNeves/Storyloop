"""Application configuration utilities."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field, field_validator

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
DEFAULT_DATABASE_PATH = (BASE_DIR / "data" / "storyloop.db").resolve()
DEFAULT_DEMO_DATABASE_PATH = (BASE_DIR / "data" / "storyloop-demo.db").resolve()


def _load_dotenv() -> None:
    """Load environment variables from the project's .env file if present."""
    env_path = ROOT_DIR / ".env"
    if env_path.exists():
        load_dotenv(env_path)


class Settings(BaseModel):
    """Application settings sourced from environment variables."""

    model_config = ConfigDict(populate_by_name=True)

    environment: str = Field(default="development", alias="ENV")
    database_url: str = Field(
        default=f"sqlite:///{DEFAULT_DATABASE_PATH}", alias="DATABASE_URL"
    )
    demo_database_url: str | None = Field(
        default=f"sqlite:///{DEFAULT_DEMO_DATABASE_PATH}",
        alias="DEMO_DATABASE_URL",
        description="Database URL to use when demo mode is enabled. Defaults to storyloop-demo.db in .data directory.",
    )
    logfire_api_key: str | None = Field(default=None, alias="LOGFIRE_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: str | None = Field(
        default=None,
        alias="ANTHROPIC_API_KEY",
        description="API key for Claude Agent SDK authentication",
    )
    youtube_api_key: str | None = Field(default=None, alias="YOUTUBE_API_KEY")
    youtube_client_id: str | None = Field(
        default=None,
        alias="YOUTUBE_OAUTH_CLIENT_ID",
        description="OAuth client id for YouTube",
    )
    youtube_client_secret: str | None = Field(
        default=None,
        alias="YOUTUBE_OAUTH_CLIENT_SECRET",
        description="OAuth client secret for YouTube",
    )
    youtube_redirect_uri: str | None = Field(
        default=None,
        alias="YOUTUBE_REDIRECT_URI",
        description="OAuth redirect URI for YouTube integrations",
    )
    youtube_demo_mode: bool = Field(
        default=False,
        alias="YOUTUBE_DEMO_MODE",
        description="Enable demo fixtures for YouTube integrations",
    )
    youtube_demo_scenario: str | None = Field(
        default=None,
        alias="YOUTUBE_DEMO_SCENARIO",
        description="Optional fixture scenario to load when demo mode is enabled",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
        alias="CORS_ORIGINS",
    )
    enable_scheduler: bool | None = Field(
        default=None,
        alias="ENABLE_SCHEDULER",
        description=(
            "Override automatic scheduler activation. Defaults to on in production"
            " and off otherwise."
        ),
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [
                origin.strip() for origin in value.split(",") if origin.strip()
            ]
        return value

    @property
    def scheduler_enabled(self) -> bool:
        """Return whether recurring jobs should run for the current environment."""
        if self.enable_scheduler is not None:
            return self.enable_scheduler
        return self.environment.lower() == "production"

    @property
    def effective_database_url(self) -> str:
        """Return the database URL to use, switching to demo DB when demo mode is enabled."""
        if self.youtube_demo_mode:
            return self.demo_database_url
        return self.database_url

    @classmethod
    def load(cls) -> "Settings":
        """Create a Settings instance populated from the environment."""
        _load_dotenv()
        values: dict[str, Any] = {}
        for field in cls.model_fields.values():
            if field.alias is None:
                continue
            value = os.getenv(field.alias)
            if value is not None:
                values[field.alias] = value
        return cls(**values)


settings = Settings.load()
