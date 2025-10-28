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
        },
    ]

    response = client.post("/entries/", json=payload)
    assert response.status_code == 200

    response = client.get("/entries/")
    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == ["entry-2", "entry-1"]
