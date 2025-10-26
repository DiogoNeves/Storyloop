"""SQLite helper utilities for the Storyloop backend."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Callable

from .config import settings

SqliteConnectionFactory = Callable[[], sqlite3.Connection]


def _sqlite_path(database_url: str) -> Path:
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        msg = "Only sqlite:/// URLs are supported during the boilerplate phase."
        raise ValueError(msg)
    path = Path(database_url[len(prefix) :]).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def create_connection_factory(
    database_url: str | None = None,
) -> SqliteConnectionFactory:
    """Return a callable that yields new SQLite connections."""
    url = database_url or settings.database_url
    database_path = _sqlite_path(url)

    def _connect() -> sqlite3.Connection:
        connection = sqlite3.connect(database_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    return _connect
