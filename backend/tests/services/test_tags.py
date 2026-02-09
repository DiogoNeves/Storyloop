from __future__ import annotations

from app.services.tags import (
    extract_tags_from_text,
    extract_tags_from_values,
    normalize_tag,
)


def test_normalize_tag_trims_hashes_and_lowercases() -> None:
    assert normalize_tag("  ##RetenTION ") == "retention"


def test_extract_tags_from_text_deduplicates_and_preserves_order() -> None:
    assert extract_tags_from_text("Try #Retention then #hooks and #retention") == [
        "retention",
        "hooks",
    ]


def test_extract_tags_from_values_merges_multiple_fields() -> None:
    tags = extract_tags_from_values(
        "Title #alpha",
        "Summary #beta #alpha",
        None,
        "Prompt #gamma",
    )
    assert tags == ["alpha", "beta", "gamma"]

