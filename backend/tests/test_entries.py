"""Tests for feed entries endpoints."""

import pytest
from datetime import datetime


@pytest.mark.asyncio
async def test_create_entry(test_client):
    """Test creating a new feed entry."""
    entry_data = {
        "title": "Test Entry",
        "summary": "This is a test entry.",
        "date": datetime.now().isoformat(),
        "category": "journal",
    }

    response = await test_client.post("/entries", json=entry_data)

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == entry_data["title"]
    assert data["summary"] == entry_data["summary"]
    assert data["category"] == entry_data["category"]
    assert "id" in data


@pytest.mark.asyncio
async def test_list_entries(test_client):
    """Test retrieving all entries."""
    # Create two entries
    entry1 = {
        "title": "First Entry",
        "summary": "First summary",
        "date": "2024-01-01T10:00:00Z",
        "category": "journal",
    }
    entry2 = {
        "title": "Second Entry",
        "summary": "Second summary",
        "date": "2024-01-02T10:00:00Z",
        "category": "journal",
    }

    await test_client.post("/entries", json=entry1)
    await test_client.post("/entries", json=entry2)

    response = await test_client.get("/entries")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    # Should be ordered by date descending
    assert data[0]["title"] == "Second Entry"
    assert data[1]["title"] == "First Entry"


@pytest.mark.asyncio
async def test_create_entry_validation(test_client):
    """Test that validation works for required fields."""
    invalid_entry = {
        "title": "",  # Empty title should fail
        "summary": "Test",
        "date": datetime.now().isoformat(),
        "category": "journal",
    }

    response = await test_client.post("/entries", json=invalid_entry)
    assert response.status_code == 422  # Validation error
