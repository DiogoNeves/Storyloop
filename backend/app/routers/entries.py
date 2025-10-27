"""Feed entries API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.models.feed_entries import (
    CreateFeedEntry,
    FeedEntry,
    create_feed_entry,
    get_feed_entries,
)

router = APIRouter()


@router.get("", response_model=list[FeedEntry])
def list_entries(request: Request) -> list[FeedEntry]:
    """Return all feed entries ordered by date descending."""
    get_db = request.app.state.get_db
    conn = get_db()
    try:
        return get_feed_entries(conn)
    finally:
        conn.close()


@router.post("", response_model=FeedEntry, status_code=201)
def create_entry(entry: CreateFeedEntry, request: Request) -> FeedEntry:
    """Create a new feed entry."""
    get_db = request.app.state.get_db
    conn = get_db()
    try:
        return create_feed_entry(conn, entry)
    finally:
        conn.close()
