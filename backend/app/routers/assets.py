"""Asset upload and retrieval endpoints.

Accepts images, PDFs, and text-based files (TXT/SRT), supports optional client-provided
SHA-256 IDs for dedupe, returns derived metadata, and streams stored bytes from disk.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.dependencies import get_asset_service
from app.routers.guards import require_non_demo
from app.services.assets import AssetService, is_text_mime_type

router = APIRouter(prefix="/assets", tags=["assets"])


@router.post("", status_code=status.HTTP_200_OK)
async def upload_asset(
    file: Annotated[UploadFile, File(...)],
    asset_service: AssetService = Depends(get_asset_service),
    _: None = Depends(require_non_demo),
) -> dict[str, object]:
    """Upload a file and return asset metadata."""
    return await _handle_upload(file, asset_service, expected_hash=None)


@router.post("/{asset_id}", status_code=status.HTTP_200_OK)
async def upload_asset_with_id(
    asset_id: str,
    file: Annotated[UploadFile, File(...)],
    asset_service: AssetService = Depends(get_asset_service),
    _: None = Depends(require_non_demo),
) -> dict[str, object]:
    """Upload a file with a client-computed hash id."""
    return await _handle_upload(file, asset_service, expected_hash=asset_id)


@router.get("/{asset_id}")
async def get_asset(
    asset_id: str,
    asset_service: AssetService = Depends(get_asset_service),
) -> FileResponse:
    """Stream asset bytes."""
    record = await asyncio.to_thread(asset_service.get_record, asset_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found"
        )

    path = asset_service.assets_root / asset_id
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found"
        )

    return FileResponse(
        path=path,
        media_type=record.mime_type,
        filename=record.original_filename,
    )


@router.get("/{asset_id}/meta")
async def get_asset_meta(
    asset_id: str,
    asset_service: AssetService = Depends(get_asset_service),
) -> dict[str, object]:
    """Return derived metadata for an asset."""
    meta = await asyncio.to_thread(asset_service.get_meta, asset_id)
    if meta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found"
        )

    return {
        "id": meta.id,
        "filename": meta.filename,
        "mimeType": meta.mime_type,
        "sizeBytes": meta.size_bytes,
        "width": meta.width,
        "height": meta.height,
    }


async def _handle_upload(
    file: UploadFile,
    asset_service: AssetService,
    *,
    expected_hash: str | None,
) -> dict[str, object]:
    if expected_hash:
        existing = await asyncio.to_thread(
            asset_service.get_record, expected_hash
        )
        if existing is not None:
            payload = await asyncio.to_thread(
                asset_service.export_meta_payload, existing
            )
            payload["alreadyExists"] = True
            return payload

    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    filename = file.filename or "upload"
    normalized_type = _normalize_content_type(content_type, filename)
    if not normalized_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only images, PDFs, and text/SRT files are supported.",
        )

    data = await file.read()

    try:
        record, already_exists = await asyncio.to_thread(
            asset_service.create_asset,
            original_filename=filename,
            content_type=normalized_type,
            data=data,
            expected_hash=expected_hash,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    payload = await asyncio.to_thread(asset_service.export_meta_payload, record)
    payload["alreadyExists"] = already_exists
    return payload


def _normalize_content_type(content_type: str, filename: str) -> str | None:
    if content_type.startswith("image/"):
        return content_type
    if content_type == "application/pdf":
        return content_type
    if is_text_mime_type(content_type):
        return content_type
    if content_type in {"application/octet-stream", ""}:
        ext = Path(filename).suffix.lower()
        if ext in {".txt", ".text"}:
            return "text/plain"
        if ext == ".srt":
            return "application/x-subrip"
    return None
