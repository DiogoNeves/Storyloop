"""Shared model-settings constants and normalization helpers."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse, urlunparse

OPENAI_ACTIVE_MODEL = "openai"
DEFAULT_OPENAI_CHAT_MODEL = "gpt-5.1-chat-latest"
DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"


@dataclass(slots=True, frozen=True)
class LoopieModelConfig:
    """Runtime model settings used to configure Loopie agents."""

    openai_api_key: str | None
    ollama_base_url: str
    active_model: str


def normalize_openai_api_key(value: str | None) -> str | None:
    """Normalize API key input, treating blank values as unset."""
    if value is None:
        return None
    normalized = value.strip()
    return normalized if normalized else None


def normalize_active_model(value: str | None) -> str:
    """Normalize active model selection with a stable default."""
    if value is None:
        return OPENAI_ACTIVE_MODEL
    normalized = value.strip()
    return normalized if normalized else OPENAI_ACTIVE_MODEL


def normalize_ollama_base_url(value: str | None) -> str:
    """Normalize and validate an Ollama base URL."""
    raw_value = (value or "").strip()
    candidate = raw_value or DEFAULT_OLLAMA_BASE_URL

    if "://" not in candidate:
        candidate = f"http://{candidate}"

    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Ollama URL must start with http:// or https://")
    if not parsed.netloc:
        raise ValueError("Ollama URL must include a host.")

    normalized_path = parsed.path.rstrip("/")
    if normalized_path.endswith("/v1"):
        normalized_path = normalized_path[: -len("/v1")]
    normalized_path = normalized_path.rstrip("/")

    normalized = urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc,
            normalized_path,
            "",
            "",
            "",
        )
    )
    return normalized.rstrip("/")
