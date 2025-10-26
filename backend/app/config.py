"""Application configuration utilities."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
DEFAULT_DATABASE_PATH = (BASE_DIR / ".data" / "storyloop.db").resolve()


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
    logfire_api_key: str | None = Field(default=None, alias="LOGFIRE_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    youtube_api_key: str | None = Field(default=None, alias="YOUTUBE_API_KEY")

    @classmethod
    def load(cls) -> "Settings":
        """Create a Settings instance populated from the environment."""
        _load_dotenv()
        values: dict[str, str | None] = {}
        for field in cls.model_fields.values():
            if field.alias is None:
                continue
            value = os.getenv(field.alias)
            if value is not None:
                values[field.alias] = value
        return cls(**values)


settings = Settings.load()
