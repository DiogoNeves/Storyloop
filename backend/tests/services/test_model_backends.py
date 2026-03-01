from __future__ import annotations

import httpx
import pytest

from app.services.model_backends import (
    OllamaModelDiscoveryError,
    build_loopie_chat_model,
    list_ollama_models,
)
from app.services.model_settings import (
    DEFAULT_OLLAMA_BASE_URL,
    LoopieModelConfig,
    OPENAI_ACTIVE_MODEL,
)


def test_build_loopie_chat_model_returns_none_without_openai_key() -> None:
    model = build_loopie_chat_model(
        LoopieModelConfig(
            openai_api_key=None,
            ollama_base_url=DEFAULT_OLLAMA_BASE_URL,
            active_model=OPENAI_ACTIVE_MODEL,
        )
    )
    assert model is None


def test_build_loopie_chat_model_returns_openai_model_with_key() -> None:
    model = build_loopie_chat_model(
        LoopieModelConfig(
            openai_api_key="sk-test",
            ollama_base_url=DEFAULT_OLLAMA_BASE_URL,
            active_model=OPENAI_ACTIVE_MODEL,
        )
    )
    assert model is not None


def test_build_loopie_chat_model_returns_ollama_model_without_openai_key() -> None:
    model = build_loopie_chat_model(
        LoopieModelConfig(
            openai_api_key=None,
            ollama_base_url=DEFAULT_OLLAMA_BASE_URL,
            active_model="qwen3:8b",
        )
    )
    assert model is not None


class _FakeResponse:
    def __init__(self, *, url: str, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload
        self._request = httpx.Request("GET", url)

    def json(self) -> dict:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "error",
                request=self._request,
                response=httpx.Response(self.status_code, request=self._request),
            )


class _FakeClient:
    def __init__(
        self,
        responses: dict[str, _FakeResponse],
        *,
        request_error: Exception | None = None,
    ) -> None:
        self._responses = responses
        self._request_error = request_error

    def __enter__(self) -> _FakeClient:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def get(self, url: str) -> _FakeResponse:
        if self._request_error is not None:
            raise self._request_error
        return self._responses[url]


def test_list_ollama_models_reads_openai_compatible_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_url = DEFAULT_OLLAMA_BASE_URL
    responses = {
        f"{base_url}/v1/models": _FakeResponse(
            url=f"{base_url}/v1/models",
            status_code=200,
            payload={"data": [{"id": "qwen3:8b"}]},
        ),
        f"{base_url}/api/tags": _FakeResponse(
            url=f"{base_url}/api/tags",
            status_code=404,
            payload={},
        ),
    }
    monkeypatch.setattr(
        "app.services.model_backends.httpx.Client",
        lambda timeout: _FakeClient(responses),
    )

    models = list_ollama_models(base_url)
    assert models == ["qwen3:8b"]


def test_list_ollama_models_falls_back_to_legacy_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_url = DEFAULT_OLLAMA_BASE_URL
    responses = {
        f"{base_url}/v1/models": _FakeResponse(
            url=f"{base_url}/v1/models",
            status_code=200,
            payload={"data": []},
        ),
        f"{base_url}/api/tags": _FakeResponse(
            url=f"{base_url}/api/tags",
            status_code=200,
            payload={"models": [{"name": "llama3.2"}]},
        ),
    }
    monkeypatch.setattr(
        "app.services.model_backends.httpx.Client",
        lambda timeout: _FakeClient(responses),
    )

    models = list_ollama_models(base_url)
    assert models == ["llama3.2"]


def test_list_ollama_models_raises_connection_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_url = DEFAULT_OLLAMA_BASE_URL
    request = httpx.Request("GET", f"{base_url}/v1/models")
    connect_error = httpx.ConnectError("boom", request=request)
    monkeypatch.setattr(
        "app.services.model_backends.httpx.Client",
        lambda timeout: _FakeClient({}, request_error=connect_error),
    )

    with pytest.raises(OllamaModelDiscoveryError, match="Could not connect"):
        list_ollama_models(base_url)
