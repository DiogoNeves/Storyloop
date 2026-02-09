"""Tag parsing and normalization utilities."""

from __future__ import annotations

import re

TAG_PATTERN = re.compile(r"#([A-Za-z0-9][A-Za-z0-9/-]*)")


def normalize_tag(value: str) -> str:
    """Normalize a raw tag string to canonical storage form."""
    return value.strip().lstrip("#").lower()


def extract_tags_from_text(text: str) -> list[str]:
    """Extract normalized hashtag tokens from text."""
    if not text:
        return []

    seen: set[str] = set()
    tags: list[str] = []
    for match in TAG_PATTERN.finditer(text):
        raw = match.group(1)
        if not raw:
            continue
        normalized = normalize_tag(raw)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        tags.append(normalized)
    return tags


def extract_tags_from_values(*values: str | None) -> list[str]:
    """Extract unique normalized tags from multiple text values."""
    seen: set[str] = set()
    tags: list[str] = []
    for value in values:
        if not value:
            continue
        for tag in extract_tags_from_text(value):
            if tag in seen:
                continue
            seen.add(tag)
            tags.append(tag)
    return tags

