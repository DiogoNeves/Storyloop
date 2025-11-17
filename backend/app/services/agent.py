"""PydanticAI agent service for conversational interactions."""

from __future__ import annotations

from typing import Awaitable, Callable

import anyio
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel

from app.config import Settings
from app.services.agent_tools import (
    JournalEntry,
    JournalRepository,
    VideoDetails,
    VideoMetrics,
    YouTubeRepository,
)


ToolObserver = Callable[[str], Awaitable[None]]


class LoopieDeps(BaseModel):
    """Dependencies available to the Loopie agent during a run."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    user_id: str
    journal_repo: JournalRepository
    youtube_repo: YouTubeRepository
    tool_observer: ToolObserver | None = None

    async def notify_tool(self, tool_name: str) -> None:
        """Notify any attached observer that a tool was invoked."""

        if self.tool_observer is None:
            return

        await self.tool_observer(tool_name)


async def build_loopie_deps(
    app: FastAPI, tool_observer: ToolObserver | None = None
) -> LoopieDeps:
    """Create Loopie dependency bundle from FastAPI application state."""

    entry_service = app.state.entry_service
    youtube_service = app.state.active_youtube_service
    user_service = app.state.user_service
    oauth_service = getattr(app.state, "youtube_oauth_service", None)

    user_id = "anonymous"
    if user_service is not None:
        active_user = await anyio.to_thread.run_sync(user_service.get_active_user)
        if active_user is not None:
            user_id = active_user.id

    return LoopieDeps(
        user_id=user_id,
        journal_repo=JournalRepository(entry_service),
        youtube_repo=YouTubeRepository(
            youtube_service, user_service, oauth_service
        ),
        tool_observer=tool_observer,
    )


def build_agent(active_settings: Settings) -> Agent[LoopieDeps, str] | None:
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

When responding, you must:
1) Infer the user's tone and creative energy from the conversation and, when needed, journal entries.
2) Prefer calling tools for journal context or YouTube details instead of guessing.
3) Deliver grounded, concise guidance with clear next steps, keeping a supportive and action-focused tone.
4) Note that future versions will store tone and preferences in persistent user memory; today you infer from provided context.

Most Storyloop users are early-stage creators, so explain metrics simply and briefly, focusing on why they matter.
If the user demonstrates deeper knowledge, match their level and keep explanations tight.

Answer exactly what the user asks with clear next steps, and add just a sprinkle of whimsy—never so much that it distracts.
Stay motivating and candid: offer pointed, constructive feedback that helps them improve, but avoid discouraging or harsh tone.
Treat the user like a partner in a direct conversation unless they share a name, and never derail into arguments—keep the focus on progress.

The Storyloop client renders Markdown, so feel free to use headings, lists, links, tables, and code blocks when they make the response clearer.
Use emojis only occasionally to highlight a special point 🌈 and keep formatting readable and concise.

Your mission: help creators grow their channels and unlock creativity without getting in their way."""

    assistant_agent: Agent[LoopieDeps, str] = Agent(
        model=model,
        system_prompt=system_prompt,
        deps_type=LoopieDeps,
    )

    @assistant_agent.tool
    async def load_journal_entries(
        ctx: RunContext[LoopieDeps],
        limit: int = 10,
        before_iso: str | None = None,
    ) -> list[JournalEntry]:
        """Load recent journal entries for the current user.

        The model should call this tool when it needs to understand:
        - what the user has been working on
        - their recent tone, energy, mood
        - their recent creative experiments

        Args:
            limit: number of entries, newest first
            before_iso: only return entries strictly before this timestamp
        """

        await ctx.deps.notify_tool("load_journal_entries")
        return await ctx.deps.journal_repo.load_entries(
            user_id=ctx.deps.user_id, limit=limit, before=before_iso
        )

    @assistant_agent.tool
    async def list_recent_videos(
        ctx: RunContext[LoopieDeps],
        limit: int = 5,
        include_shorts: bool = False,
    ) -> list[VideoDetails]:
        """Load recent video details for the active channel.

        Use this to ground any ideas, rewrites, or comparisons in real uploads.
        Exclude Shorts unless the user explicitly requests them.
        """

        await ctx.deps.notify_tool("list_recent_videos")
        return await ctx.deps.youtube_repo.list_recent_videos(
            limit=limit, include_shorts=include_shorts
        )

    @assistant_agent.tool
    async def get_video_details(
        ctx: RunContext[LoopieDeps], video_id: str
    ) -> VideoDetails:
        """Load details for a specific YouTube video.

        Use when generating:
        - titles
        - descriptions
        - project ideas
        - comparisons with past content

        This tool prevents hallucinating video metadata.
        """

        await ctx.deps.notify_tool("get_video_details")
        return await ctx.deps.youtube_repo.get_video(video_id)

    @assistant_agent.tool
    async def get_video_metrics(
        ctx: RunContext[LoopieDeps], video_id: str
    ) -> VideoMetrics:
        """Load metrics for a specific YouTube video to anchor analysis.

        Call this before making quantitative claims about performance.
        """

        await ctx.deps.notify_tool("get_video_metrics")
        return await ctx.deps.youtube_repo.get_video_metrics(video_id)

    return assistant_agent
