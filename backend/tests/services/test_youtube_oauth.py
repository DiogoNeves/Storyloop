import pytest
from google.auth.exceptions import RefreshError

from app.config import Settings
from app.services.youtube import YoutubeConfigurationError
from app.services.youtube_oauth import YoutubeOAuthService


class FakeCredentials:
    def __init__(self) -> None:
        self.expired = True
        self.refresh_token = "refresh-token"

    def refresh(self, _request: object) -> None:
        raise RefreshError("invalid_grant")


def _build_settings() -> Settings:
    return Settings(
        YOUTUBE_OAUTH_CLIENT_ID="client-id",
        YOUTUBE_OAUTH_CLIENT_SECRET="client-secret",
        YOUTUBE_REDIRECT_URI="http://localhost/callback",
    )


def test_refresh_credentials_wraps_refresh_error() -> None:
    service = YoutubeOAuthService(_build_settings())
    credentials = FakeCredentials()

    with pytest.raises(YoutubeConfigurationError) as excinfo:
        service.refresh_credentials(credentials)  # type: ignore[arg-type]

    assert "no longer valid" in str(excinfo.value)
