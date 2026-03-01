"""Runtime wiring for agent and speech services based on user settings."""

from __future__ import annotations

from fastapi import FastAPI

from app.services.agent import build_agent, build_smart_entry_agent
from app.services.model_settings import LoopieModelConfig
from app.services.speech_to_text import build_speech_to_text_service
from app.services.users import UserService


def build_runtime_model_config(user_service: UserService) -> LoopieModelConfig:
    """Build normalized model config from persisted user settings."""
    return LoopieModelConfig(
        openai_api_key=user_service.get_openai_api_key(),
        ollama_base_url=user_service.get_ollama_base_url(),
        active_model=user_service.get_active_model(),
    )


def refresh_runtime_ai_services(
    app: FastAPI,
    *,
    user_service: UserService | None = None,
) -> None:
    """Refresh AI runtime services on application state."""
    resolved_user_service = user_service or getattr(app.state, "user_service")
    runtime_model_config = build_runtime_model_config(resolved_user_service)
    app.state.assistant_agent = build_agent(runtime_model_config)
    app.state.smart_entry_agent = build_smart_entry_agent(runtime_model_config)
    app.state.speech_to_text_service = build_speech_to_text_service(
        runtime_model_config.openai_api_key
    )
