"""Provider wiring and Ollama model-discovery helpers."""

from __future__ import annotations

from collections import OrderedDict
from typing import Any

import httpx
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.services.model_settings import (
    DEFAULT_OPENAI_CHAT_MODEL,
    LoopieModelConfig,
    OPENAI_ACTIVE_MODEL,
    normalize_active_model,
    normalize_ollama_base_url,
    normalize_openai_api_key,
)


class OllamaModelDiscoveryError(Exception):
    """Raised when Ollama model discovery fails."""


def build_loopie_chat_model(
    runtime_config: LoopieModelConfig,
) -> OpenAIChatModel | None:
    """Create the active chat model using OpenAI-compatible provider wiring."""
    normalized_active_model = normalize_active_model(runtime_config.active_model)
    normalized_ollama_url = normalize_ollama_base_url(
        runtime_config.ollama_base_url
    )
    normalized_openai_key = normalize_openai_api_key(
        runtime_config.openai_api_key
    )

    if normalized_active_model == OPENAI_ACTIVE_MODEL:
        if normalized_openai_key is None:
            return None
        return OpenAIChatModel(
            DEFAULT_OPENAI_CHAT_MODEL,
            provider=OpenAIProvider(api_key=normalized_openai_key),
        )

    return OpenAIChatModel(
        normalized_active_model,
        provider=OpenAIProvider(base_url=f"{normalized_ollama_url}/v1"),
    )


def list_ollama_models(
    ollama_base_url: str,
    *,
    timeout_seconds: float = 8.0,
) -> list[str]:
    """List Ollama model names using OpenAI-compatible and legacy endpoints."""
    normalized_base_url = normalize_ollama_base_url(ollama_base_url)
    endpoints = ("/v1/models", "/api/tags")
    had_successful_probe = False
    last_status_error: httpx.HTTPStatusError | None = None

    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            for path in endpoints:
                url = f"{normalized_base_url}{path}"
                response = client.get(url)

                if response.status_code == 404:
                    try:
                        response.raise_for_status()
                    except httpx.HTTPStatusError as exc:
                        last_status_error = exc
                    continue

                response.raise_for_status()
                had_successful_probe = True

                payload = _parse_json_object(response)
                model_names = _parse_model_names(payload)
                if model_names:
                    return model_names
    except httpx.TimeoutException as exc:
        raise OllamaModelDiscoveryError(
            f"Timed out connecting to Ollama at {normalized_base_url}."
        ) from exc
    except httpx.ConnectError as exc:
        raise OllamaModelDiscoveryError(
            f"Could not connect to Ollama at {normalized_base_url}."
        ) from exc
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        raise OllamaModelDiscoveryError(
            f"Ollama returned HTTP {status_code} at {normalized_base_url}."
        ) from exc
    except httpx.RequestError as exc:
        raise OllamaModelDiscoveryError(
            f"Could not reach Ollama at {normalized_base_url}."
        ) from exc

    if had_successful_probe:
        return []
    if last_status_error is not None:
        raise OllamaModelDiscoveryError(
            f"Ollama did not expose model endpoints at {normalized_base_url}."
        ) from last_status_error
    return []


def _parse_json_object(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise OllamaModelDiscoveryError(
            "Ollama returned a non-JSON response while listing models."
        ) from exc
    if not isinstance(payload, dict):
        raise OllamaModelDiscoveryError(
            "Ollama returned an invalid JSON payload while listing models."
        )
    return payload


def _parse_model_names(payload: dict[str, Any]) -> list[str]:
    names: list[str] = []

    data = payload.get("data")
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            candidate = item.get("id") or item.get("name") or item.get("model")
            if isinstance(candidate, str):
                normalized = candidate.strip()
                if normalized:
                    names.append(normalized)

    models = payload.get("models")
    if isinstance(models, list):
        for item in models:
            if not isinstance(item, dict):
                continue
            candidate = item.get("name") or item.get("model") or item.get("id")
            if isinstance(candidate, str):
                normalized = candidate.strip()
                if normalized:
                    names.append(normalized)

    unique_names = list(OrderedDict.fromkeys(names))
    return unique_names
