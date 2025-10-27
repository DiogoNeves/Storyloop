import sys
from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.main import create_app
from app.schema import ensure_schema

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture
def test_app():
    """Create a FastAPI app instance with in-memory database."""
    test_settings = Settings(
        environment="test",
        database_url="sqlite:///:memory:",
        scheduler_enabled=False,
    )
    app = create_app(test_settings)

    # Initialize schema for test database
    conn = app.state.get_db()
    try:
        ensure_schema(conn)
    finally:
        conn.close()

    return app


@pytest.fixture
async def test_client(test_app):
    """Create an async HTTP client for testing."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=test_app),
        base_url="http://test",
    ) as client:
        yield client
