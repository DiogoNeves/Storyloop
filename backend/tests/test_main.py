"""Tests for FastAPI application setup."""

from __future__ import annotations

import pytest

from app.config import Settings
from app.main import create_app


def test_create_app_requires_youtube_api_key_when_demo_disabled() -> None:
    settings = Settings(database_url="sqlite:///:memory:", youtube_demo_mode=False)

    with pytest.raises(RuntimeError, match="YouTube API key is required"):
        create_app(settings)
