"""Shared pytest fixtures for backend tests."""

from __future__ import annotations

import sqlite3
import uuid
from collections.abc import Callable, Generator
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from app.db import SqliteConnectionFactory
else:
    SqliteConnectionFactory = Callable[[], sqlite3.Connection]


@pytest.fixture()
def memory_connection_factory() -> Generator[
    SqliteConnectionFactory, None, None
]:
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
