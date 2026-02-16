"""Integration tests for the entries API endpoints."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db import SqliteConnectionFactory
from app.routers.entries import router as entries_router
from app.services.entries import EntryService


def _create_test_app(memory_connection_factory: SqliteConnectionFactory) -> FastAPI:
    entry_service = EntryService(memory_connection_factory)
    entry_service.ensure_schema()

    app = FastAPI()
    app.state.entry_service = entry_service
    app.include_router(entries_router)
    return app


def test_save_entries_returns_only_new_records(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    payload = [
        {
            "id": "entry-a",
            "title": "First entry",
            "summary": "Explored retention curve drop-offs.",
            "date": now.isoformat(),
            "category": "journal",
            "videoId": "abc123",
        }
    ]

    response = client.post("/entries/", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == "entry-a"

    # Submitting the same payload should yield an empty response (nothing new saved).
    response = client.post("/entries/", json=payload)
    assert response.status_code == 200
    assert response.json() == []

    payload.append(
        {
            "id": "entry-b",
            "title": "Second entry",
            "summary": "Compared hook experiments.",
            "date": (now + timedelta(hours=2)).isoformat(),
            "category": "journal",
        }
    )

    response = client.post("/entries/", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == ["entry-b"]


def test_save_entry_without_summary_defaults_to_blank(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    payload = [
        {
            "id": "entry-no-summary",
            "title": "Entry without description",
            "date": now.isoformat(),
            "category": "journal",
        }
    ]

    response = client.post("/entries/", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["summary"] == ""


def test_list_entries_returns_persisted_records(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    payload = [
        {
            "id": "entry-1",
            "title": "Earlier entry",
            "summary": "Analyzed thumbnail variations.",
            "date": (now - timedelta(hours=1)).isoformat(),
            "category": "journal",
            "pinned": True,
        },
        {
            "id": "entry-2",
            "title": "Latest entry",
            "summary": "Captured retention improvements.",
            "date": now.isoformat(),
            "category": "journal",
            "videoId": "linked-video",
        },
    ]

    response = client.post("/entries/", json=payload)
    assert response.status_code == 200

    response = client.get("/entries/")
    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == ["entry-1", "entry-2"]
    assert body[0]["pinned"] is True
    assert body[0]["archived"] is False
    assert body[0]["archivedAt"] is None
    assert body[0]["tags"] == []


def test_get_entry_returns_single_record(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    payload = [
        {
            "id": "entry-1",
            "title": "Persisted entry",
            "summary": "Stored for retrieval. #retention",
            "date": now.isoformat(),
            "category": "journal",
            "videoId": "linked-video",
        }
    ]

    response = client.post("/entries/", json=payload)
    assert response.status_code == 200

    response = client.get("/entries/entry-1")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "entry-1"
    assert body["videoId"] == "linked-video"
    assert body["archived"] is False
    assert body["archivedAt"] is None
    assert body["tags"] == ["retention"]


def test_update_entry_allows_blank_summary(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    payload = [
        {
            "id": "entry-blank-summary",
            "title": "Persisted entry",
            "summary": "Stored for update.",
            "date": now.isoformat(),
            "category": "journal",
        }
    ]

    response = client.post("/entries/", json=payload)
    assert response.status_code == 200

    update_payload = {
        "title": "Updated title",
        "summary": " ",
    }

    response = client.put("/entries/entry-blank-summary", json=update_payload)
    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == ""


def test_update_entry_modifies_record(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    payload = [
        {
            "id": "entry-1",
            "title": "Persisted entry",
            "summary": "Stored for update.",
            "date": now.isoformat(),
            "category": "journal",
        }
    ]

    response = client.post("/entries/", json=payload)
    assert response.status_code == 200

    update_payload = {
        "title": "Updated title",
        "summary": "Updated summary.",
        "videoId": "video-123",
        "pinned": True,
        "archived": True,
    }

    response = client.put("/entries/entry-1", json=update_payload)
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated title"
    assert body["summary"] == "Updated summary."
    assert body["videoId"] == "video-123"
    assert body["pinned"] is True
    assert body["archived"] is True
    assert body["archivedAt"] is not None


def test_today_entry_create_and_update_are_normalized(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    create_payload = [
        {
            "id": "today-2026-02-16",
            "title": "Today",
            "summary": "",
            "date": now.isoformat(),
            "category": "today",
            "promptBody": "ignored",
            "promptFormat": "ignored",
            "pinned": True,
            "archived": True,
        }
    ]

    create_response = client.post("/entries/", json=create_payload)
    assert create_response.status_code == 200
    created = create_response.json()[0]
    assert created["summary"] == "- [ ]"
    assert created["pinned"] is False
    assert created["archived"] is False
    assert created["promptBody"] is None
    assert created["promptFormat"] is None

    update_response = client.put(
        "/entries/today-2026-02-16",
        json={
            "summary": "- [ ] Plan hooks\n- [x] Publish",
            "pinned": True,
            "archived": True,
            "promptBody": "ignored",
            "promptFormat": "ignored",
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["summary"] == "- [ ] Plan hooks\n- [x] Publish\n- [ ]"
    assert updated["pinned"] is False
    assert updated["archived"] is False
    assert updated["promptBody"] is None
    assert updated["promptFormat"] is None


def test_today_entry_rejects_non_task_markdown(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    create_payload = [
        {
            "id": "today-2026-02-16",
            "title": "Today",
            "summary": "# heading",
            "date": now.isoformat(),
            "category": "today",
        }
    ]

    create_response = client.post("/entries/", json=create_payload)
    assert create_response.status_code == 422
    assert "checklist rows only" in create_response.json()["detail"]


def test_archiving_entry_sets_archived_at_and_preserves_it_on_later_edits(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    payload = [
        {
            "id": "entry-archive-updated-at",
            "title": "Archivable entry",
            "summary": "Stored before archiving.",
            "date": now.isoformat(),
            "category": "journal",
        }
    ]

    create_response = client.post("/entries/", json=payload)
    assert create_response.status_code == 200
    initial_updated_at = create_response.json()[0]["updatedAt"]

    time.sleep(0.01)

    archive_response = client.put(
        "/entries/entry-archive-updated-at", json={"archived": True}
    )
    assert archive_response.status_code == 200
    archived_body = archive_response.json()
    assert archived_body["archived"] is True
    assert archived_body["archivedAt"] is not None
    assert archived_body["updatedAt"] != initial_updated_at
    archived_at = archived_body["archivedAt"]

    time.sleep(0.01)

    edit_response = client.put(
        "/entries/entry-archive-updated-at",
        json={"summary": "Edited while archived."},
    )
    assert edit_response.status_code == 200
    edited_body = edit_response.json()
    assert edited_body["archived"] is True
    assert edited_body["archivedAt"] == archived_at
    assert edited_body["updatedAt"] != archived_body["updatedAt"]


def test_unarchiving_entry_clears_archived_timestamp(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    payload = [
        {
            "id": "entry-unarchive-clears-timestamp",
            "title": "Archivable entry",
            "summary": "Stored before unarchiving.",
            "date": now.isoformat(),
            "category": "journal",
        }
    ]
    create_response = client.post("/entries/", json=payload)
    assert create_response.status_code == 200

    archive_response = client.put(
        "/entries/entry-unarchive-clears-timestamp", json={"archived": True}
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["archivedAt"] is not None

    unarchive_response = client.put(
        "/entries/entry-unarchive-clears-timestamp", json={"archived": False}
    )
    assert unarchive_response.status_code == 200
    assert unarchive_response.json()["archived"] is False
    assert unarchive_response.json()["archivedAt"] is None


def test_non_journal_entries_cannot_be_archived(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    payload = [
        {
            "id": "entry-content-1",
            "title": "Video entry",
            "summary": "Content summary",
            "date": now.isoformat(),
            "category": "content",
            "archived": True,
        }
    ]

    create_response = client.post("/entries/", json=payload)
    assert create_response.status_code == 200
    assert create_response.json()[0]["archived"] is False
    assert create_response.json()[0]["archivedAt"] is None

    update_response = client.put(
        "/entries/entry-content-1",
        json={"archived": True},
    )
    assert update_response.status_code == 200
    assert update_response.json()["archived"] is False
    assert update_response.json()["archivedAt"] is None


def test_delete_entry_removes_record(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    app = _create_test_app(memory_connection_factory)
    client = TestClient(app)

    now = datetime.now(tz=UTC)
    payload = [
        {
            "id": "entry-1",
            "title": "Persisted entry",
            "summary": "Stored for deletion.",
            "date": now.isoformat(),
            "category": "journal",
        }
    ]

    response = client.post("/entries/", json=payload)
    assert response.status_code == 200

    response = client.delete("/entries/entry-1")
    assert response.status_code == 204

    response = client.get("/entries/entry-1")
    assert response.status_code == 404
