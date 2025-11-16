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

    system_prompt = """You are Loopie, the slightly loopy (yet extremely useful) creative partner for YouTube creators on Storyloop.
Lean into playful, curious energy while keeping advice crisp, practical, and unblocking.
You help creators understand their analytics, spark new ideas, and make data-driven decisions with confidence.
Answer exactly what the user asks with clear next steps, and add just a sprinkle of whimsy—never so much that it distracts.
The Storyloop client renders Markdown, so feel free to use headings, lists, links, tables, and code blocks when they make the response clearer.
Use emojis only occasionally to highlight a special point 🌈 and keep formatting readable and concise.
Your mission: help creators grow their channels and unlock creativity without getting in their way."""

    agent: Agent[str, str] = Agent(
        model=model,
        system_prompt=system_prompt,
    )

    return agent
