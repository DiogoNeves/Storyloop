"""Service layer modules."""

from app.services.agent import build_agent, build_loopie_deps, build_smart_entry_agent
from app.services.ai_runtime import refresh_runtime_ai_services
from app.services.assets import AssetService
from app.services.entries import EntryRecord, EntryService
from app.services.speech_to_text import (
    SpeechToTextService,
    build_speech_to_text_service,
)
from app.services.model_backends import (
    OllamaModelDiscoveryError,
    list_ollama_models,
)
from app.services.model_settings import (
    DEFAULT_OLLAMA_BASE_URL,
    OPENAI_ACTIVE_MODEL,
    normalize_active_model,
    normalize_ollama_base_url,
    normalize_openai_api_key,
)
from app.services.today_entries import TodayEntryManager
from app.services.youtube import YoutubeService
from app.services.youtube_analytics import YoutubeAnalyticsService
from app.services.youtube_demo import (
    DemoUserService,
    DemoYoutubeOAuthService,
    DemoYoutubeService,
    FakeYoutubeApiClient,
)
from app.services.youtube_oauth import YoutubeOAuthService
from app.services.users import UserRecord, UserService

__all__ = [
    "build_agent",
    "build_loopie_deps",
    "build_smart_entry_agent",
    "refresh_runtime_ai_services",
    "AssetService",
    "EntryRecord",
    "EntryService",
    "SpeechToTextService",
    "build_speech_to_text_service",
    "OllamaModelDiscoveryError",
    "list_ollama_models",
    "DEFAULT_OLLAMA_BASE_URL",
    "OPENAI_ACTIVE_MODEL",
    "normalize_openai_api_key",
    "normalize_ollama_base_url",
    "normalize_active_model",
    "TodayEntryManager",
    "UserRecord",
    "UserService",
    "DemoYoutubeService",
    "DemoYoutubeOAuthService",
    "DemoUserService",
    "FakeYoutubeApiClient",
    "YoutubeAnalyticsService",
    "YoutubeService",
    "YoutubeOAuthService",
]
