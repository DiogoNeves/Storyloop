import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from app.services.users import DEFAULT_SMART_UPDATE_INTERVAL_HOURS


@pytest.mark.asyncio
async def test_get_settings_returns_default_schedule() -> None:
    settings = Settings.model_validate(
        {"DATABASE_URL": "sqlite:///:memory:", "YOUTUBE_API_KEY": "test-key"}
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            response = await client.get("/settings/")

    assert response.status_code == 200
    payload = response.json()
    assert (
        payload["smartUpdateScheduleHours"]
        == DEFAULT_SMART_UPDATE_INTERVAL_HOURS
    )
    assert payload["showArchived"] is False
    assert payload["activityFeedSortDate"] == "created"


@pytest.mark.asyncio
async def test_update_settings_persists_schedule() -> None:
    settings = Settings.model_validate(
        {"DATABASE_URL": "sqlite:///:memory:", "YOUTUBE_API_KEY": "test-key"}
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            update_response = await client.put(
                "/settings/", json={"smartUpdateScheduleHours": 6}
            )
            followup = await client.get("/settings/")
            archive_toggle = await client.put(
                "/settings/", json={"showArchived": True}
            )
            followup_archive = await client.get("/settings/")
            sort_toggle = await client.put(
                "/settings/", json={"activityFeedSortDate": "modified"}
            )
            followup_sort = await client.get("/settings/")

    assert update_response.status_code == 200
    assert update_response.json()["smartUpdateScheduleHours"] == 6
    assert update_response.json()["showArchived"] is False
    assert followup.status_code == 200
    assert followup.json()["smartUpdateScheduleHours"] == 6
    assert followup.json()["showArchived"] is False
    assert archive_toggle.status_code == 200
    assert archive_toggle.json()["showArchived"] is True
    assert followup_archive.status_code == 200
    assert followup_archive.json()["showArchived"] is True
    assert sort_toggle.status_code == 200
    assert sort_toggle.json()["activityFeedSortDate"] == "modified"
    assert followup_sort.status_code == 200
    assert followup_sort.json()["activityFeedSortDate"] == "modified"
