from datetime import UTC, datetime
import io
import zipfile

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.db_helpers.conversations import insert_conversation, insert_turn
from app.main import create_app
from app.services.model_backends import OllamaModelDiscoveryError
from app.services.model_settings import (
    DEFAULT_OLLAMA_BASE_URL,
    OPENAI_ACTIVE_MODEL,
)
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
    assert payload["openaiKeyConfigured"] is False
    assert payload["ollamaBaseUrl"] == DEFAULT_OLLAMA_BASE_URL
    assert payload["activeModel"] == OPENAI_ACTIVE_MODEL


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
            openai_toggle = await client.put(
                "/settings/",
                json={"openaiApiKey": "test-openai-key"},
            )
            followup_openai = await client.get("/settings/")
            model_toggle = await client.put(
                "/settings/",
                json={"activeModel": "qwen3:8b"},
            )
            followup_model = await client.get("/settings/")
            clear_openai = await client.put(
                "/settings/",
                json={"openaiApiKey": ""},
            )
            followup_openai_cleared = await client.get("/settings/")

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
    assert "openaiApiKey" not in openai_toggle.json()
    assert openai_toggle.json()["openaiKeyConfigured"] is True
    assert followup_openai.status_code == 200
    assert followup_openai.json()["openaiKeyConfigured"] is True
    assert model_toggle.status_code == 200
    assert model_toggle.json()["activeModel"] == "qwen3:8b"
    assert followup_model.status_code == 200
    assert followup_model.json()["activeModel"] == "qwen3:8b"
    assert clear_openai.status_code == 200
    assert clear_openai.json()["openaiKeyConfigured"] is False
    assert followup_openai_cleared.status_code == 200
    assert followup_openai_cleared.json()["openaiKeyConfigured"] is False


@pytest.mark.asyncio
async def test_connect_ollama_returns_models_and_persists_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings.model_validate(
        {"DATABASE_URL": "sqlite:///:memory:", "YOUTUBE_API_KEY": "test-key"}
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    monkeypatch.setattr(
        "app.routers.settings.list_ollama_models",
        lambda base_url: ["qwen3:8b", "llama3.2"],
    )

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            response = await client.post(
                "/settings/ollama/connect",
                json={"ollamaBaseUrl": "127.0.0.1:11434/v1"},
            )
            followup = await client.get("/settings/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ollamaBaseUrl"] == DEFAULT_OLLAMA_BASE_URL
    assert payload["models"] == ["qwen3:8b", "llama3.2"]
    assert followup.status_code == 200
    assert followup.json()["ollamaBaseUrl"] == DEFAULT_OLLAMA_BASE_URL


@pytest.mark.asyncio
async def test_connect_ollama_maps_discovery_failure_to_502(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings.model_validate(
        {"DATABASE_URL": "sqlite:///:memory:", "YOUTUBE_API_KEY": "test-key"}
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    def _raise_discovery_error(_base_url: str) -> list[str]:
        raise OllamaModelDiscoveryError("Could not connect to Ollama")

    monkeypatch.setattr(
        "app.routers.settings.list_ollama_models",
        _raise_discovery_error,
    )

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            response = await client.post(
                "/settings/ollama/connect",
                json={"ollamaBaseUrl": "http://127.0.0.1:11434"},
            )

    assert response.status_code == 502
    assert "Could not connect to Ollama" in response.json()["detail"]


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


@pytest.mark.asyncio
async def test_export_content_archive_includes_user_created_content() -> None:
    settings = Settings.model_validate(
        {"DATABASE_URL": "sqlite:///:memory:", "YOUTUBE_API_KEY": "test-key"}
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    journal_date = datetime(2026, 2, 1, 14, 0, tzinfo=UTC).isoformat()
    today_date = datetime(2026, 2, 2, 9, 0, tzinfo=UTC).isoformat()

    async with app.router.lifespan_context(app):
        connection = app.state.get_db()
        try:
            insert_conversation(connection, "conv-export", "Conversation #ops")
            insert_turn(
                connection,
                "conv-export",
                "user",
                "Link this @entry:journal-export #chat",
            )
            insert_turn(
                connection,
                "conv-export",
                "assistant",
                "Use [Journal](/entryref/journal-export) now.",
            )
        finally:
            connection.close()

        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            save_response = await client.post(
                "/entries/",
                json=[
                    {
                        "id": "journal-export",
                        "title": "Journal Export",
                        "summary": "Track @entry:today-export #alpha",
                        "date": journal_date,
                        "category": "journal",
                        "promptBody": "Summarize this week #focus",
                    },
                    {
                        "id": "today-export",
                        "title": "Today",
                        "summary": "- [ ] Done #today",
                        "date": today_date,
                        "category": "today",
                        "linkUrl": "https://example.com/today",
                    },
                    {
                        "id": "content-export",
                        "title": "Imported content",
                        "summary": "External feed item",
                        "date": today_date,
                        "category": "content",
                    },
                ],
            )
            export_response = await client.get("/settings/export")

    assert save_response.status_code == 200
    assert export_response.status_code == 200
    assert export_response.headers["content-type"] == "application/zip"
    disposition = export_response.headers.get("content-disposition", "")
    assert "attachment" in disposition
    assert "storyloop-export.zip" in disposition

    archive = zipfile.ZipFile(io.BytesIO(export_response.content))
    markdown_files = archive.namelist()
    assert len(markdown_files) >= 3

    markdown_values = [
        archive.read(file_name).decode("utf-8")
        for file_name in markdown_files
    ]
    assert not any(
        "External feed item" in markdown for markdown in markdown_values
    )

    smart_note = next(
        markdown
        for markdown in markdown_values
        if 'storyloopType: "smart_journal"' in markdown
    )
    assert "prompt: |" in smart_note
    assert "@entry:" not in smart_note
    assert "/entryref/" not in smart_note
    assert "[[" in smart_note

    today_note = next(
        markdown
        for markdown in markdown_values
        if 'storyloopType: "today"' in markdown
    )
    assert "## Links" in today_note
    assert "https://example.com/today" in today_note

    conversation_note = next(
        markdown
        for markdown in markdown_values
        if 'storyloopType: "conversation"' in markdown
    )
    assert "### User (" in conversation_note
    assert "### Assistant (" in conversation_note
