"""PydanticAI agent service for conversational interactions."""

from __future__ import annotations

from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel

from app.config import Settings


def build_agent(active_settings: Settings) -> Agent[str, str] | None:
    """Build and configure a PydanticAI agent for Storyloop creators.

    Args:
        active_settings: Settings instance to use for configuration

    Returns None if OPENAI_API_KEY is not configured, allowing the app to
    start without agent functionality (similar to YouTube OAuth).
    """
    if not active_settings.openai_api_key:
        return None

    # PydanticAI reads OPENAI_API_KEY from environment variable
    import os

    # Ensure the API key is set in environment for PydanticAI to use
    os.environ["OPENAI_API_KEY"] = active_settings.openai_api_key
    model = OpenAIChatModel("gpt-5-nano")

    system_prompt = """You are a helpful creative partner for YouTube content creators using Storyloop.
You help creators understand their analytics, track patterns, and make data-driven decisions about their content.
Be concise, actionable, and supportive. Focus on insights that help creators improve their content strategy."""

    agent: Agent[str, str] = Agent(
        model=model,
        system_prompt=system_prompt,
    )

    return agent
