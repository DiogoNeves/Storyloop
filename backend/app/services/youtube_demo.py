"""Demo-only YouTube service that replays canned API responses."""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Mapping

import httpx

from app.services.youtube import (
    YoutubeAPIRequestError,
    YoutubeApiClient,
    YoutubeService,
)

logger = logging.getLogger(__name__)

FIXTURE_ROOT = Path(__file__).resolve().parent.parent / "fixtures" / "youtube"
IGNORE_PARAMS = {"key", "access_token", "oauth_token"}


class FixtureLoader:
    """Load JSON payloads from the YouTube demo fixture bundle."""

    def __init__(self, scenario: str) -> None:
        self.scenario = scenario
        self.base_path = FIXTURE_ROOT / scenario
        if not self.base_path.exists():
            raise FileNotFoundError(
                f"YouTube demo fixture scenario '{scenario}' is not available"
            )

    def load(
        self,
        endpoint: str,
        operation: str = "list",
        params: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Return the fixture payload for the requested endpoint."""
        candidates = self._candidate_paths(endpoint, operation, params)
        for path in candidates:
            if path.exists():
                with path.open(encoding="utf-8") as handle:
                    return json.load(handle)
        formatted = " -> ".join(str(path) for path in candidates)
        raise FileNotFoundError(
            f"No fixture found for {endpoint}.{operation} with params {params}."
            f" Checked: {formatted}"
        )

    def _candidate_paths(
        self,
        endpoint: str,
        operation: str,
        params: Mapping[str, Any] | None,
    ) -> list[Path]:
        filtered = self._filter_params(params)
        suffixes: list[str] = []
        if filtered:
            suffixes.append(self._params_to_suffix(filtered))
            if "pageToken" in filtered:
                without_page = dict(filtered)
                without_page.pop("pageToken", None)
                if without_page:
                    suffixes.append(self._params_to_suffix(without_page))
        suffixes.append("default")

        candidates: list[Path] = []
        for suffix in suffixes:
            candidates.append(
                self.base_path / endpoint / operation / f"{suffix}.json"
            )
            candidates.append(self.base_path / endpoint / f"{suffix}.json")
        return candidates

    def _filter_params(
        self, params: Mapping[str, Any] | None
    ) -> dict[str, Any]:
        if not params:
            return {}
        filtered = {
            key: value
            for key, value in params.items()
            if key not in IGNORE_PARAMS and value not in (None, "")
        }
        return filtered

    def _params_to_suffix(self, params: Mapping[str, Any]) -> str:
        parts: list[str] = []
        for key, value in sorted(params.items()):
            normalized_value = self._sanitize_value(value)
            parts.append(f"{key}-{normalized_value}")
        return "__".join(parts) if parts else "default"

    def _sanitize_value(self, value: Any) -> str:
        if isinstance(value, bool):
            value_str = "true" if value else "false"
        elif isinstance(value, (int, float)):
            value_str = str(value)
        else:
            value_str = str(value)
        # Collapse separators to make filesystem-friendly names.
        value_str = value_str.replace(",", "_")
        sanitized = re.sub(r"[^A-Za-z0-9._-]", "-", value_str)
        sanitized = re.sub(r"-+", "-", sanitized).strip("-")
        return sanitized or "value"


class FakeYoutubeRequest:
    """Minimal object that mimics googleapiclient request wrappers."""

    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def execute(self) -> dict[str, Any]:
        return self._payload


class FakeYoutubeResource:
    """Expose list() returning FakeYoutubeRequest objects."""

    def __init__(self, loader: FixtureLoader, endpoint: str) -> None:
        self._loader = loader
        self._endpoint = endpoint

    def list(self, **kwargs: Any) -> FakeYoutubeRequest:
        payload = self._loader.load(self._endpoint, "list", kwargs)
        return FakeYoutubeRequest(payload)


class FakeYoutubeApiClient(YoutubeApiClient):
    """Fake client implementing the small subset of methods the app needs."""

    def __init__(self, loader: FixtureLoader) -> None:
        self._loader = loader

    def channels(self) -> FakeYoutubeResource:  # type: ignore[override]
        return FakeYoutubeResource(self._loader, "channels")

    def playlistItems(self) -> FakeYoutubeResource:  # type: ignore[override]
        return FakeYoutubeResource(self._loader, "playlistItems")

    def videos(self) -> FakeYoutubeResource:  # type: ignore[override]
        return FakeYoutubeResource(self._loader, "videos")


class DemoYoutubeService(YoutubeService):
    """YouTube service variant that sources responses from fixture bundles."""

    def __init__(
        self,
        *,
        scenario: str | None = None,
        api_key: str | None = "demo",
        transport: httpx.AsyncBaseTransport | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__(api_key=api_key or "demo", transport=transport, client=client)
        selected_scenario = scenario or os.getenv(
            "YOUTUBE_DEMO_SCENARIO", "baseline"
        )
        try:
            self._fixture_loader = FixtureLoader(selected_scenario)
        except FileNotFoundError as exc:  # pragma: no cover - configuration error
            raise YoutubeAPIRequestError(str(exc)) from exc
        self._scenario = selected_scenario

    async def _request_json(
        self, client: httpx.AsyncClient, endpoint: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        try:
            return self._fixture_loader.load(endpoint, "list", params)
        except FileNotFoundError as exc:
            logger.error("Missing YouTube demo fixture: %s", exc)
            raise YoutubeAPIRequestError(str(exc)) from exc

    def build_authenticated_client(
        self,
        user_service: Any,
        oauth_service: Any,
    ) -> FakeYoutubeApiClient:
        return FakeYoutubeApiClient(self._fixture_loader)


__all__ = ["DemoYoutubeService", "FakeYoutubeApiClient"]
