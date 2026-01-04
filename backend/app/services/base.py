"""Base classes for database-backed services."""

from __future__ import annotations

from contextlib import closing
from sqlite3 import Cursor
from typing import Any

from app.db import SqliteConnectionFactory


class DatabaseService:
    """Base class providing common database access patterns.

    Services that interact with SQLite can inherit from this class to get
    consistent connection management and query execution helpers.
    """

    def __init__(self, connection_factory: SqliteConnectionFactory) -> None:
        self._connection_factory = connection_factory

    def _execute(
        self,
        query: str,
        params: tuple[Any, ...] = (),
    ) -> Cursor:
        """Execute a read-only query and return the cursor.

        The connection is closed after the query completes. Use this for
        SELECT queries where you need the cursor for fetchone/fetchall.
        """
        with closing(self._connection_factory()) as connection:
            return connection.execute(query, params)

    def _execute_and_commit(
        self,
        query: str,
        params: tuple[Any, ...] = (),
    ) -> Cursor:
        """Execute a query and commit the transaction.

        Use this for INSERT, UPDATE, DELETE operations that modify data.
        """
        with closing(self._connection_factory()) as connection:
            cursor = connection.execute(query, params)
            connection.commit()
            return cursor


__all__ = ["DatabaseService"]
