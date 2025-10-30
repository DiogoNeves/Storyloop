"""SQLite helper utilities for the Storyloop backend."""

from __future__ import annotations

import atexit
import sqlite3
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse
from uuid import uuid4

from app.config import settings

SqliteConnectionFactory = Callable[[], sqlite3.Connection]


def _sqlite_path(database_url: str) -> Path:
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        msg = "Only sqlite:/// URLs are supported during the boilerplate phase."
        raise ValueError(msg)
    path = Path(database_url[len(prefix) :]).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _create_shared_memory_factory(uri: str | None = None) -> SqliteConnectionFactory:
    """Create a connection factory that targets a shared in-memory database."""

    identifier = uri or f"file:storyloop-test-{uuid4().hex}?mode=memory&cache=shared"
    if "?" not in identifier and not identifier.startswith(":memory:"):
        identifier = f"{identifier}?mode=memory&cache=shared"

    base_connection = sqlite3.connect(
        identifier,
        uri=identifier.startswith("file:"),
        check_same_thread=False,
    )
    base_connection.row_factory = sqlite3.Row
    atexit.register(base_connection.close)

    def _connect() -> sqlite3.Connection:
        _ = base_connection  # keep the base connection alive inside the closure
        connection = sqlite3.connect(
            identifier,
            uri=identifier.startswith("file:"),
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        return connection

    return _connect


def create_connection_factory(
    database_url: str | None = None,
) -> SqliteConnectionFactory:
    """Return a callable that yields new SQLite connections."""

    url = database_url or settings.database_url
    parsed_url = urlparse(url)

    if parsed_url.scheme != "sqlite":
        msg = "Only sqlite URLs are supported during the boilerplate phase."
        raise ValueError(msg)

    sanitized_path = parsed_url.path.lstrip("/")

    if sanitized_path == ":memory:":
        return _create_shared_memory_factory()

    if sanitized_path.startswith("file:") and "mode=memory" in parsed_url.query:
        shared_uri = sanitized_path
        if parsed_url.query:
            shared_uri = f"{sanitized_path}?{parsed_url.query}"
        return _create_shared_memory_factory(shared_uri)

    database_path = _sqlite_path(url)

    def _connect() -> sqlite3.Connection:
        connection = sqlite3.connect(database_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    return _connect
