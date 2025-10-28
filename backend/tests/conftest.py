"""Shared pytest fixtures for backend tests."""

from __future__ import annotations

import sqlite3
import sys
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if TYPE_CHECKING:
    from app.db import SqliteConnectionFactory
else:
    SqliteConnectionFactory = Callable[[], sqlite3.Connection]


@pytest.fixture()
def memory_connection_factory() -> SqliteConnectionFactory:
    """Provide a connection factory backed by an isolated in-memory database."""

    db_identifier = uuid.uuid4().hex
    base_connection = sqlite3.connect(
        f"file:{db_identifier}?mode=memory&cache=shared",
        uri=True,
        check_same_thread=False,
    )
    base_connection.row_factory = sqlite3.Row

    def _connect() -> sqlite3.Connection:
        connection = sqlite3.connect(
            f"file:{db_identifier}?mode=memory&cache=shared",
            uri=True,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        return connection

    try:
        yield _connect
    finally:
        base_connection.close()
