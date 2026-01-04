"""Asset storage and metadata helpers."""

from __future__ import annotations

import base64
import hashlib
import io
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

from pypdf import PdfReader
from PIL import Image

from app.db import SqliteConnectionFactory
from app.services.base import DatabaseService

MAX_IMAGE_EDGE_PX = 2000
ASSET_URL_PREFIX = "/assets/"


@dataclass(slots=True)
class AssetRecord:
    """Persisted metadata for an uploaded asset."""

    id: str
    original_filename: str
    mime_type: str
    created_at: str
    extracted_text: str | None


@dataclass(slots=True)
class AssetMeta:
    """Derived metadata for serving assets."""

    id: str
    filename: str
    mime_type: str
    size_bytes: int
    width: int | None
    height: int | None


class AssetService(DatabaseService):
    """Manage asset persistence on disk and metadata in SQLite."""

    def __init__(
        self,
        connection_factory: SqliteConnectionFactory,
        database_url: str,
        *,
        demo_mode: bool = False,
    ) -> None:
        super().__init__(connection_factory)
        self._database_url = database_url
        self._demo_mode = demo_mode
        self._assets_root = _resolve_assets_root(database_url)

    @property
    def assets_root(self) -> Path:
        return self._assets_root

    def ensure_schema(self) -> None:
        """Create the assets table if it does not already exist."""
        with self._connection_factory() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY,
                    original_filename TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    extracted_text TEXT
                )
                """
            )
            connection.commit()

    def get_record(self, asset_id: str) -> AssetRecord | None:
        """Return stored metadata for an asset if it exists."""
        with self._connection_factory() as connection:
            row = connection.execute(
                """
                SELECT id, original_filename, mime_type, created_at, extracted_text
                FROM assets
                WHERE id = ?
                """,
                (asset_id,),
            ).fetchone()

        if row is None:
            return None

        return AssetRecord(
            id=row[0],
            original_filename=row[1],
            mime_type=row[2],
            created_at=row[3],
            extracted_text=row[4],
        )

    def list_records(self, asset_ids: Iterable[str]) -> list[AssetRecord]:
        """Return metadata for a list of asset identifiers."""
        ids = [asset_id for asset_id in asset_ids if asset_id]
        if not ids:
            return []
        placeholders = ", ".join("?" for _ in ids)
        with self._connection_factory() as connection:
            rows = connection.execute(
                f"""
                SELECT id, original_filename, mime_type, created_at, extracted_text
                FROM assets
                WHERE id IN ({placeholders})
                """,
                ids,
            ).fetchall()

        return [
            AssetRecord(
                id=row[0],
                original_filename=row[1],
                mime_type=row[2],
                created_at=row[3],
                extracted_text=row[4],
            )
            for row in rows
        ]

    def get_meta(self, asset_id: str) -> AssetMeta | None:
        """Return derived metadata for an asset."""
        record = self.get_record(asset_id)
        if record is None:
            return None

        path = self._asset_path(asset_id)
        if not path.exists():
            return None

        size_bytes = path.stat().st_size
        width: int | None = None
        height: int | None = None
        if record.mime_type.startswith("image/"):
            with Image.open(path) as image:
                width, height = image.size

        return AssetMeta(
            id=record.id,
            filename=record.original_filename,
            mime_type=record.mime_type,
            size_bytes=size_bytes,
            width=width,
            height=height,
        )

    def create_asset(
        self,
        *,
        original_filename: str,
        content_type: str,
        data: bytes,
        expected_hash: str | None = None,
    ) -> tuple[AssetRecord, bool]:
        """Persist an asset and return (record, already_exists)."""
        if self._demo_mode:
            raise RuntimeError("Assets are disabled in demo mode.")

        if content_type.startswith("image/"):
            try:
                processed = _process_image(data)
            except Exception as exc:  # noqa: BLE001
                raise ValueError("Unable to process image upload.") from exc
            data = processed.data
            content_type = processed.mime_type

        extracted_text = None
        if content_type == "application/pdf":
            extracted_text = _extract_pdf_text(data)

        asset_hash = _sha256_hex(data)
        if expected_hash is not None and asset_hash != expected_hash:
            raise ValueError("Uploaded content hash did not match asset id.")

        record = self.get_record(asset_hash)
        if record is not None:
            return record, True

        self._assets_root.mkdir(parents=True, exist_ok=True)
        path = self._asset_path(asset_hash)
        path.write_bytes(data)

        created_at = datetime.utcnow().isoformat()
        record = AssetRecord(
            id=asset_hash,
            original_filename=original_filename,
            mime_type=content_type,
            created_at=created_at,
            extracted_text=extracted_text,
        )

        with self._connection_factory() as connection:
            connection.execute(
                """
                INSERT INTO assets (id, original_filename, mime_type, created_at, extracted_text)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    record.id,
                    record.original_filename,
                    record.mime_type,
                    record.created_at,
                    record.extracted_text,
                ),
            )
            connection.commit()

        return record, False

    def resolve_url(self, asset_id: str) -> str:
        return f"{ASSET_URL_PREFIX}{asset_id}"

    def load_bytes(self, asset_id: str) -> bytes | None:
        """Read asset bytes from disk."""
        path = self._asset_path(asset_id)
        if not path.exists():
            return None
        return path.read_bytes()

    def build_data_url(self, asset_id: str) -> str | None:
        """Return a base64 data URL for an asset."""
        record = self.get_record(asset_id)
        if record is None:
            return None
        data = self.load_bytes(asset_id)
        if data is None:
            return None
        encoded = base64.b64encode(data).decode("utf-8")
        return f"data:{record.mime_type};base64,{encoded}"

    def export_meta_payload(self, record: AssetRecord) -> dict[str, object]:
        """Return combined payload with derived metadata."""
        meta = self.get_meta(record.id)
        size_bytes = meta.size_bytes if meta is not None else 0
        width = meta.width if meta is not None else None
        height = meta.height if meta is not None else None
        markdown = _markdown_for_asset(record.original_filename, record.id, record.mime_type)
        return {
            "id": record.id,
            "url": self.resolve_url(record.id),
            "filename": record.original_filename,
            "mimeType": record.mime_type,
            "sizeBytes": size_bytes,
            "width": width,
            "height": height,
            "markdown": markdown,
        }

    def _asset_path(self, asset_id: str) -> Path:
        return self._assets_root / asset_id


@dataclass(slots=True)
class _ProcessedImage:
    data: bytes
    mime_type: str


def _resolve_assets_root(database_url: str) -> Path:
    parsed_url = urlparse(database_url)
    if parsed_url.scheme != "sqlite":
        msg = "Only sqlite URLs are supported for asset storage."
        raise ValueError(msg)
    if parsed_url.path in (":memory:", "/:memory:"):
        return Path(tempfile.mkdtemp(prefix="storyloop-assets-"))
    database_path = Path(parsed_url.path.lstrip("/")).expanduser().resolve()
    return database_path.parent / "assets"


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _process_image(data: bytes) -> _ProcessedImage:
    with Image.open(io.BytesIO(data)) as image:
        original_format = image.format or "PNG"
        width, height = image.size
        if max(width, height) > MAX_IMAGE_EDGE_PX:
            image.thumbnail((MAX_IMAGE_EDGE_PX, MAX_IMAGE_EDGE_PX))

        if original_format.upper() in {"JPEG", "JPG"} and image.mode in {"RGBA", "LA", "P"}:
            image = image.convert("RGB")

        output = io.BytesIO()
        image.save(output, format=original_format)
        mime_type = Image.MIME.get(original_format, "image/png")
        return _ProcessedImage(data=output.getvalue(), mime_type=mime_type)


def _extract_pdf_text(data: bytes) -> str | None:
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception:  # noqa: BLE001
        return None

    text_chunks: list[str] = []
    for page in reader.pages:
        extracted = page.extract_text() or ""
        if extracted:
            text_chunks.append(extracted)

    joined = "\n\n".join(text_chunks).strip()
    return joined or None


def _markdown_for_asset(filename: str, asset_id: str, mime_type: str) -> str:
    url = f"{ASSET_URL_PREFIX}{asset_id}"
    safe_label = filename or "asset"
    if mime_type.startswith("image/"):
        return f"![{safe_label}]({url})"
    return f"[{safe_label}]({url})"


def extract_asset_ids(markdown: str) -> list[str]:
    """Extract asset identifiers from markdown content."""
    if not markdown:
        return []
    matches: list[str] = []
    seen: set[str] = set()
    for match in _ASSET_PATTERN.finditer(markdown):
        asset_id = match.group(1)
        if asset_id in seen:
            continue
        seen.add(asset_id)
        matches.append(asset_id)
    return matches


_ASSET_PATTERN = re.compile(r"/assets/([a-f0-9]{64})")

__all__ = [
    "ASSET_URL_PREFIX",
    "AssetMeta",
    "AssetRecord",
    "AssetService",
    "MAX_IMAGE_EDGE_PX",
    "extract_asset_ids",
]
