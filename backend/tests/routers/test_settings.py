from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from app.services.today_entries import build_today_entry_id, utc_day_key
from app.services.users import DEFAULT_ACCENT_COLOR, DEFAULT_SMART_UPDATE_INTERVAL_HOURS


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
    assert payload["todayEntriesEnabled"] is True
    assert payload["todayIncludePreviousIncomplete"] is True
    assert payload["todayMoveCompletedToEnd"] is True
    assert payload["accentColor"] == DEFAULT_ACCENT_COLOR


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
            today_toggle = await client.put(
                "/settings/",
                json={
                    "todayEntriesEnabled": False,
                    "todayIncludePreviousIncomplete": False,
                    "todayMoveCompletedToEnd": False,
                },
            )
            followup_today = await client.get("/settings/")
            accent_toggle = await client.put(
                "/settings/", json={"accentColor": "violet"}
            )
            followup_accent = await client.get("/settings/")

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
    assert today_toggle.status_code == 200
    assert today_toggle.json()["todayEntriesEnabled"] is False
    assert today_toggle.json()["todayIncludePreviousIncomplete"] is False
    assert today_toggle.json()["todayMoveCompletedToEnd"] is False
    assert followup_today.status_code == 200
    assert followup_today.json()["todayEntriesEnabled"] is False
    assert followup_today.json()["todayIncludePreviousIncomplete"] is False
    assert followup_today.json()["todayMoveCompletedToEnd"] is False
    assert accent_toggle.status_code == 200
    assert accent_toggle.json()["accentColor"] == "violet"
    assert followup_accent.status_code == 200
    assert followup_accent.json()["accentColor"] == "violet"


@pytest.mark.asyncio
async def test_enabling_today_entries_creates_today_entry() -> None:
    settings = Settings.model_validate(
        {"DATABASE_URL": "sqlite:///:memory:", "YOUTUBE_API_KEY": "test-key"}
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)
    today_entry_id = build_today_entry_id(utc_day_key(datetime.now(tz=UTC)))

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            disable_response = await client.put(
                "/settings/", json={"todayEntriesEnabled": False}
            )
            assert disable_response.status_code == 200

            # Ensure missing state before re-enabling.
            _ = await client.delete(f"/entries/{today_entry_id}")
            missing_response = await client.get(f"/entries/{today_entry_id}")
            assert missing_response.status_code == 404

            enable_response = await client.put(
                "/settings/", json={"todayEntriesEnabled": True}
            )
            created_response = await client.get(f"/entries/{today_entry_id}")

    assert enable_response.status_code == 200
    assert enable_response.json()["todayEntriesEnabled"] is True
    assert created_response.status_code == 200
    assert created_response.json()["id"] == today_entry_id
    assert created_response.json()["category"] == "today"
