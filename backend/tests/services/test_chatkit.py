"""Unit tests for the ChatKit service helpers."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.chatkit import ChatKitConfigurationError, ChatKitService


class _StubSessions:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs):  # type: ignore[no-untyped-def]
        self.calls.append(kwargs)
        return SimpleNamespace(
            id="cksess_test",
            client_secret="client_secret",
            expires_at=1,
            max_requests_per_1_minute=10,
        )


def test_chatkit_service_requires_api_key() -> None:
    with pytest.raises(ChatKitConfigurationError):
        ChatKitService(api_key=None, workflow_id="wf_demo")


def test_chatkit_service_requires_workflow() -> None:
    with pytest.raises(ChatKitConfigurationError):
        ChatKitService(api_key="test", workflow_id=None)


def test_chatkit_service_creates_session_with_expected_payload() -> None:
    sessions = _StubSessions()
    client = SimpleNamespace(beta=SimpleNamespace(chatkit=SimpleNamespace(sessions=sessions)))
    service = ChatKitService(
        api_key="key",
        workflow_id="wf_demo",
        default_file_uploads_enabled=True,
        client=client,
    )

    session = service.create_session(user_id="user-123", enable_file_uploads=None)

    assert session.client_secret == "client_secret"
    assert sessions.calls == [
        {
            "user": "user-123",
            "workflow": {"id": "wf_demo"},
            "chatkit_configuration": {"file_upload": {"enabled": True}},
        }
    ]


def test_chatkit_service_allows_overriding_file_uploads() -> None:
    sessions = _StubSessions()
    client = SimpleNamespace(beta=SimpleNamespace(chatkit=SimpleNamespace(sessions=sessions)))
    service = ChatKitService(
        api_key="key",
        workflow_id="wf_demo",
        default_file_uploads_enabled=False,
        client=client,
    )

    service.create_session(user_id="user-123", enable_file_uploads=True)

    assert sessions.calls[0]["chatkit_configuration"] == {
        "file_upload": {"enabled": True}
    }
