"""Backfill archived timestamps for already archived entries.

Sets `archived_at` to the current UTC timestamp for any row where:
- `archived = 1`
- `archived_at IS NULL`
"""

from __future__ import annotations

import argparse
import sys
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings
from app.db import create_connection_factory
from app.services.entries import EntryService


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill entries.archived_at with the current UTC timestamp for "
            "already archived rows."
        )
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help=(
            "SQLite database URL (sqlite:///...). "
            "Defaults to configured effective database URL."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print how many rows would be updated without writing changes.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    database_url = args.database_url or settings.effective_database_url
    connection_factory = create_connection_factory(database_url)
    entry_service = EntryService(connection_factory)

    # Ensure archived_at exists before running the backfill update.
    entry_service.ensure_schema()
    timestamp = datetime.now(tz=UTC).isoformat()

    with closing(connection_factory()) as connection:
        pending_row = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM entries
            WHERE archived = 1 AND archived_at IS NULL
            """
        ).fetchone()
        pending_total = int(pending_row["total"]) if pending_row else 0

        if args.dry_run:
            print(
                f"[dry-run] Would update {pending_total} archived entries in {database_url} "
                f"with archived_at={timestamp}"
            )
            return 0

        cursor = connection.execute(
            """
            UPDATE entries
            SET archived_at = ?
            WHERE archived = 1 AND archived_at IS NULL
            """,
            (timestamp,),
        )
        connection.commit()

    print(
        f"Updated {cursor.rowcount} archived entries in {database_url} "
        f"with archived_at={timestamp}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
