"""Base classes for database-backed services."""

from __future__ import annotations

from contextlib import closing
from sqlite3 import Row
from typing import Any

from app.db import SqliteConnectionFactory


class DatabaseService:
    """Base class providing common database access patterns.

    Services that interact with SQLite can inherit from this class to get
    consistent connection management and query execution helpers.
    """

    def __init__(self, connection_factory: SqliteConnectionFactory) -> None:
        self._connection_factory = connection_factory

    def _fetch_all(
        self,
        query: str,
        params: tuple[Any, ...] = (),
    ) -> list[Row]:
        """Execute a query and return all rows.

        Use this for SELECT queries that return multiple rows.
        """
        with closing(self._connection_factory()) as connection:
            cursor = connection.execute(query, params)
            return cursor.fetchall()

    def _fetch_one(
        self,
        query: str,
        params: tuple[Any, ...] = (),
    ) -> Row | None:
        """Execute a query and return the first row, or None.

        Use this for SELECT queries that return a single row.
        """
        with closing(self._connection_factory()) as connection:
            cursor = connection.execute(query, params)
            return cursor.fetchone()

    def _execute_and_commit(
        self,
        query: str,
        params: tuple[Any, ...] = (),
    ) -> int:
        """Execute a query, commit, and return lastrowid.

        Use this for INSERT, UPDATE, DELETE operations that modify data.
        Returns the lastrowid (useful for INSERT) or 0 if not applicable.
        """
        with closing(self._connection_factory()) as connection:
            cursor = connection.execute(query, params)
            connection.commit()
            return cursor.lastrowid or 0


__all__ = ["DatabaseService"]
