from __future__ import annotations

import pytest
from PIL import Image

from app.db import SqliteConnectionFactory
from app.services.assets import AssetService


def test_create_asset_handles_decompression_bomb_errors(
    memory_connection_factory: SqliteConnectionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AssetService(
        memory_connection_factory,
        "sqlite:///:memory:",
    )
    service.ensure_schema()

    def _raise_decompression_bomb(_: bytes) -> object:
        raise Image.DecompressionBombError("Image size exceeds limit.")

    monkeypatch.setattr(
        "app.services.assets._process_image",
        _raise_decompression_bomb,
    )

    with pytest.raises(ValueError, match="Unable to process image upload."):
        service.create_asset(
            original_filename="oversized.png",
            content_type="image/png",
            data=b"not-an-image",
        )
