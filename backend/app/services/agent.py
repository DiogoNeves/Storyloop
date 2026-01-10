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
    BaseEntryRepository,
    BaseJournalRepository,
    BaseYouTubeRepository,
    ChannelMetrics,
    EmptyEntryRepository,
    EmptyJournalRepository,
    EmptyYouTubeRepository,
    EntryDetails,
    EntryRepository,
    JournalEntry,
    JournalRepository,
    VideoCountResult,
    VideoDetails,
    VideoMetrics,
    YouTubeRepository,
)


class LoopieDeps(BaseModel):
    """Dependencies available to the Loopie agent during a run."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    user_id: str
    entry_repo: BaseEntryRepository
    journal_repo: BaseJournalRepository
    youtube_repo: BaseYouTubeRepository
    tool_call_notifier: Callable[[str], Awaitable[None]] | None = None


async def build_loopie_deps(
    app: FastAPI,
    *,
    tool_call_notifier: Callable[[str], Awaitable[None]] | None = None,
) -> LoopieDeps:
    """Create Loopie dependency bundle from FastAPI application state."""

    entry_service = getattr(app.state, "entry_service", None)
    asset_service = getattr(app.state, "asset_service", None)
    youtube_service = getattr(app.state, "active_youtube_service", None)
    user_service = getattr(app.state, "user_service", None)
    oauth_service = getattr(app.state, "youtube_oauth_service", None)
    analytics_service = getattr(app.state, "youtube_analytics_service", None)

    user_id = "anonymous"
    if user_service is not None:
        active_user = await anyio.to_thread.run_sync(
            user_service.get_active_user
        )
        if active_user is not None:
            user_id = active_user.id

    entry_repo: BaseEntryRepository
    if entry_service is None:
        entry_repo = EmptyEntryRepository()
    else:
        entry_repo = EntryRepository(entry_service)

    journal_repo: BaseJournalRepository
    if entry_service is None:
        journal_repo = EmptyJournalRepository()
    else:
        journal_repo = JournalRepository(entry_service, asset_service)

    youtube_repo: BaseYouTubeRepository
    if youtube_service is None or user_service is None:
        youtube_repo = EmptyYouTubeRepository()
    else:
        youtube_repo = YouTubeRepository(
            youtube_service, user_service, oauth_service, analytics_service
        )

    return LoopieDeps(
        user_id=user_id,
        entry_repo=entry_repo,
        journal_repo=journal_repo,
        youtube_repo=youtube_repo,
        tool_call_notifier=tool_call_notifier,
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
    model = OpenAIChatModel("gpt-5.1-chat-latest")

    system_prompt = """You are Loopie, the slightly loopy (yet extremely useful) creative partner for YouTube creators on Storyloop.
Lean into playful, curious energy while keeping advice crisp, practical, and unblocking.
You help creators understand their analytics, spark new ideas, and make data-driven decisions with confidence.

When responding, you must:
1) Infer the user's tone and creative energy from the conversation and, when needed, journal entries.
2) Prefer calling tools for journal context or YouTube details instead of guessing.
3) Deliver grounded, concise guidance with clear next steps, keeping a supportive and action-focused tone.
4) Note that future versions will store tone and preferences in persistent user memory; today you infer from provided context.
5) Be explicit about any gaps in knowledge or access—say what you don't know instead of guessing.

Most Storyloop users are early-stage creators, so explain metrics simply and briefly, focusing on why they matter.
If the user demonstrates deeper knowledge, match their level and keep explanations tight.

You will receive two clearly marked sections: "Conversation history" (oldest to newest, which may be empty on the first turn) and "Latest user turn". Use the history to stay consistent with what the assistant and user have already said, but answer only the latest turn.

Answer exactly what the user asks with clear next steps, and add just a sprinkle of whimsy—never so much that it distracts.
Stay motivating and candid: offer pointed, constructive feedback that helps them improve, but avoid discouraging or harsh tone.
Treat the user like a partner in a direct conversation unless they share a name, and never derail into arguments—keep the focus on progress.

The Storyloop client renders Markdown, so feel free to use headings, lists, links, tables, and code blocks when they make the response clearer.
Use emojis only occasionally to highlight a special point 🌈 and keep formatting readable and concise.

When creating links:
- Always use relative links (starting with `/`) for internal Storyloop navigation—these open in the same tab.
- Use descriptive markdown labels like `[Open journal reflection](/journals/123)` instead of bare URLs.
- For external resources (YouTube, websites, etc.), use full URLs—these will open in the default browser/separate tab.
- Available internal routes:
  - Journal list: `/` or `/journal` for the main journal feed
  - Journal detail: `/journals/{journalId}` for a specific journal entry
  - Conversation detail: `/conversations/{conversationId}` for a saved Loopie conversation thread
  - Video detail: `/videos/{videoId}` for the Storyloop video detail view (use this instead of YouTube URLs when referencing videos)
  - Loopie workspace: `/loopie` for the dedicated Loopie canvas
- When linking to journals or videos, always use their actual titles whenever possible. Call the appropriate tools (`load_journal_entries`, `get_video_details`, `list_recent_videos`, `list_videos`) to retrieve titles before creating links.
  - Journal links: Use the journal entry title, e.g., `[Review "{journal title}"](/journals/{journalId})` instead of generic text like "Review journal entry".
  - Video links: Use the video title, e.g., `[View "{video title}" in Storyloop](/videos/{videoId})` instead of generic text like "View video".
  - Only fall back to dates or generic descriptions if the title is unavailable or inappropriate.
- When linking to past work, prefer journal and conversation links first.
- For conversations, use a brief topic description if a title isn't available: `[Reopen Loopie chat about {topic}](/conversations/{conversationId})`.

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

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("👀 your latest journal entries")

        return await ctx.deps.journal_repo.load_entries(
            user_id=ctx.deps.user_id, limit=limit, before=before_iso
        )

    @assistant_agent.tool
    async def get_entry_details(
        ctx: RunContext[LoopieDeps], entry_id: str
    ) -> EntryDetails:
        """Load details for a specific Storyloop entry.

        Use this when the user references a journal entry or content item by ID
        and you need its title, summary, or category.
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("🧾 entry details")

        return await ctx.deps.entry_repo.get_entry(entry_id)

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

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("📺 your latest uploads")

        return await ctx.deps.youtube_repo.list_recent_videos(
            limit=limit, include_shorts=include_shorts
        )

    @assistant_agent.tool
    async def list_videos(
        ctx: RunContext[LoopieDeps],
        *,
        limit: int = 50,
        start_iso: str | None = None,
        end_iso: str | None = None,
        include_shorts: bool = False,
        max_scan: int | None = None,
    ) -> list[VideoDetails]:
        """List videos for the active channel, optionally filtered by publish date.

        Use this when you need to look across multiple uploads (e.g., "what did I
        publish last year?", "show me my uploads from October").
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("📚 a list of your uploads")

        return await ctx.deps.youtube_repo.list_videos(
            limit=limit,
            include_shorts=include_shorts,
            start_iso=start_iso,
            end_iso=end_iso,
            max_scan=max_scan,
        )

    @assistant_agent.tool
    async def count_videos_published(
        ctx: RunContext[LoopieDeps],
        *,
        start_iso: str | None = None,
        end_iso: str | None = None,
        include_shorts: bool = False,
        max_scan: int | None = None,
    ) -> VideoCountResult:
        """Count videos published in a date range for the active channel.

        Prefer this tool for quantitative questions like "how many videos did I
        publish last year?" to avoid guessing.
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("🧮 counting your uploads")

        return await ctx.deps.youtube_repo.count_videos_published(
            start_iso=start_iso,
            end_iso=end_iso,
            include_shorts=include_shorts,
            max_scan=max_scan,
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

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("🧾 details for a specific video")

        return await ctx.deps.youtube_repo.get_video(video_id)

    @assistant_agent.tool
    async def get_video_metrics(
        ctx: RunContext[LoopieDeps], video_id: str
    ) -> VideoMetrics:
        """Load metrics for a specific YouTube video to anchor analysis.

        Call this before making quantitative claims about performance.
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("📈 metrics for a specific video")

        return await ctx.deps.youtube_repo.get_video_metrics(video_id)

    @assistant_agent.tool
    async def get_channel_metrics(
        ctx: RunContext[LoopieDeps],
    ) -> ChannelMetrics:
        """Load overall metrics for the active YouTube channel.

        Call this to get channel-wide statistics like total views,
        subscriber count, and video count. Useful for understanding
        the creator's overall reach and growth.
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("📊 channel-wide statistics")

        return await ctx.deps.youtube_repo.get_channel_metrics()

    return assistant_agent
