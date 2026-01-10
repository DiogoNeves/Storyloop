"""Integration tests for the entries API endpoints."""

from __future__ import annotations

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
    assert [item["id"] for item in body] == ["entry-2", "entry-1"]
    assert body[0]["videoId"] == "linked-video"


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
            "summary": "Stored for retrieval.",
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
    }

    response = client.put("/entries/entry-1", json=update_payload)
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated title"
    assert body["summary"] == "Updated summary."
    assert body["videoId"] == "video-123"


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
