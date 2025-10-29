import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


@pytest.mark.asyncio
async def test_health_endpoint_returns_ready_status() -> None:
    settings = Settings(database_url="sqlite:///:memory:")
    app = create_app(settings)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "Storyloop API ready"}
