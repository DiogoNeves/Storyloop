"""PydanticAI agent service for conversational interactions."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Awaitable, Callable

import anyio
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from promptdown import StructuredPrompt

from app.config import Settings
from app.services.agent_tools import (
    BaseChannelProfileRepository,
    BaseEntryRepository,
    BaseJournalRepository,
    BaseTodayRepository,
    BaseYouTubeRepository,
    ChannelMetrics,
    ChannelProfileRepository,
    EmptyEntryRepository,
    EmptyJournalRepository,
    EmptyChannelProfileRepository,
    EmptyTodayRepository,
    EmptyYouTubeRepository,
    EntryRepository,
    JournalEntry,
    JournalEntryDetails,
    JournalEntryInput,
    JournalRepository,
    TodayEntry,
    TodayRepository,
    VideoCountResult,
    VideoDetails,
    VideoMetrics,
    YouTubeRepository,
)
from app.services.channel_profile import (
    ChannelProfilePatch,
    ChannelProfileSnapshot,
)
from app.services.channel_profile_advice import (
    ChannelProfileAdvice,
    get_channel_profile_advice as load_channel_profile_advice,
)


def _load_promptdown_system_message(
    prompt_file: str,
    template_values: dict[str, str] | None = None,
) -> str:
    prompt_path = (
        Path(__file__).resolve().parent.parent / "prompts" / prompt_file
    )
    structured_prompt = StructuredPrompt.from_promptdown_file(str(prompt_path))
    if template_values:
        structured_prompt = structured_prompt.apply_template_values(
            template_values
        )
    resolved_prompt = (
        structured_prompt.system_message or structured_prompt.developer_message
    )
    if not resolved_prompt:
        raise ValueError(
            f"Prompt file {prompt_file} is missing a system message."
        )
    return resolved_prompt


class LoopieDeps(BaseModel):
    """Dependencies available to the Loopie agent during a run."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    user_id: str
    entry_repo: BaseEntryRepository
    journal_repo: BaseJournalRepository
    today_repo: BaseTodayRepository
    youtube_repo: BaseYouTubeRepository
    channel_profile_repo: BaseChannelProfileRepository
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

    today_repo: BaseTodayRepository
    if entry_service is None:
        today_repo = EmptyTodayRepository()
    else:
        today_repo = TodayRepository(entry_service)

    youtube_repo: BaseYouTubeRepository
    if youtube_service is None or user_service is None:
        youtube_repo = EmptyYouTubeRepository()
    else:
        youtube_repo = YouTubeRepository(
            youtube_service, user_service, oauth_service, analytics_service
        )

    channel_profile_repo: BaseChannelProfileRepository
    if user_service is None:
        channel_profile_repo = EmptyChannelProfileRepository()
    else:
        channel_profile_repo = ChannelProfileRepository(user_service)

    return LoopieDeps(
        user_id=user_id,
        entry_repo=entry_repo,
        journal_repo=journal_repo,
        today_repo=today_repo,
        youtube_repo=youtube_repo,
        channel_profile_repo=channel_profile_repo,
        tool_call_notifier=tool_call_notifier,
    )


def build_agent(
    active_settings: Settings,
    *,
    system_prompt: str | None = None,
) -> Agent[LoopieDeps, str] | None:
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

    resolved_prompt = system_prompt or _load_promptdown_system_message(
        "loopie.prompt.md"
    )

    assistant_agent: Agent[LoopieDeps, str] = Agent(
        model=model,
        system_prompt=resolved_prompt,
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
            before_iso: only return entries strictly before this updated_at timestamp
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("👀 your latest journal entries")

        return await ctx.deps.journal_repo.load_entries(
            user_id=ctx.deps.user_id, limit=limit, before=before_iso
        )

    @assistant_agent.tool
    async def load_today_entries(
        ctx: RunContext[LoopieDeps],
        limit: int = 5,
        before_iso: str | None = None,
    ) -> list[TodayEntry]:
        """Load recent Today checklist entries for achievement tracking.

        Use this when the user asks what they completed, shipped, or achieved.
        This is less common than ``load_journal_entries`` and should be used
        mainly for progress-tracking conversations.
        When comparing multiple days, treat an older pending task that appears
        completed in a later day as completed work. If an older pending task
        does not appear in later days, treat it as potentially forgotten.

        Args:
            limit: number of entries, newest first
            before_iso: only return entries strictly before this updated_at timestamp
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier(
                "✅ your recent Today checklists"
            )

        return await ctx.deps.today_repo.load_entries(
            user_id=ctx.deps.user_id, limit=limit, before=before_iso
        )

    @assistant_agent.tool
    async def grep_journal_entries(
        ctx: RunContext[LoopieDeps],
        keyword: str,
        limit: int = 30,
    ) -> list[JournalEntry]:
        """Search journal entries for a literal substring or short keyword.

        Use when the user wants to find past notes by a specific word or phrase.
        Pass a short literal query (3+ characters), ideally 1-2 distinct words.
        Avoid quotes, wildcards, or boolean operators.

        Example tool call:
        grep_journal_entries(keyword="retention hook", limit=5)
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier(
                f'🔎 searching journal entries for "{keyword}"'
            )

        return await ctx.deps.journal_repo.search_entries(
            user_id=ctx.deps.user_id, keyword=keyword, limit=limit
        )

    @assistant_agent.tool
    async def read_journal_entry(
        ctx: RunContext[LoopieDeps], entry_id: str
    ) -> JournalEntryDetails:
        """Load a journal entry for editing or quoting.

        This tool returns a short ``content_hash``. Pass that hash into
        ``edit_journal_entry`` to guarantee you are editing the latest content.
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("🧾 journal entry details")

        return await ctx.deps.journal_repo.get_entry(entry_id)

    @assistant_agent.tool
    async def edit_journal_entry(
        ctx: RunContext[LoopieDeps],
        entry_id: str,
        content_hash: str,
        title: str,
        content_markdown: str,
        pinned: bool | None = None,
    ) -> JournalEntryDetails:
        """Edit a journal entry after reading it.

        ``content_hash`` must come from the most recent ``read_journal_entry``.
        If the hash mismatches, you must read the entry again before editing.
        Only set ``pinned`` if the user explicitly asks to pin or unpin the entry.

        Put the full Markdown document in ``content_markdown``. Do not write the
        entry content outside the tool call or use placeholders. Do not ask for
        confirmation; make the best-guess edit and then suggest improvements or
        clarifications in the follow-up response.
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("✏️ updating a journal entry")

        payload = JournalEntryInput(
            title=title,
            content_markdown=content_markdown,
            pinned=pinned,
        )
        return await ctx.deps.journal_repo.update_entry(
            entry_id, payload, content_hash
        )

    @assistant_agent.tool
    async def create_journal_entry(
        ctx: RunContext[LoopieDeps],
        title: str,
        content_markdown: str,
        occurred_at_iso: str | None = None,
    ) -> JournalEntryDetails:
        """Create a new journal entry.

        Generate a strong title and put the full Markdown document in
        ``content_markdown``. Do not write the entry content outside the tool call
        or use placeholders. Do not ask for confirmation; make the best-guess
        entry and then suggest improvements or clarifications in the follow-up.
        After creating the entry, return a link to `/journals/{entry_id}`.

        Example tool call:
        create_journal_entry(
            title="Channel Performance Snapshot — Oct 2024",
            content_markdown="## Overview\n- Views: 120k\n\n| Metric | Value |\n| --- | --- |\n| Views | 120k |\n| Subs | +320 |",
        )
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("📝 creating a journal entry")

        occurred_at = None
        if occurred_at_iso:
            normalized_iso = occurred_at_iso
            if normalized_iso.endswith("Z"):
                normalized_iso = f"{normalized_iso[:-1]}+00:00"
            occurred_at = datetime.fromisoformat(normalized_iso)

        payload = JournalEntryInput(
            title=title, content_markdown=content_markdown
        )
        return await ctx.deps.journal_repo.create_entry(payload, occurred_at)

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
    async def get_channel_profile(
        ctx: RunContext[LoopieDeps],
    ) -> ChannelProfileSnapshot:
        """Load the stored channel profile for identity/emotion/action context.

        Use this before calling ``update_channel_profile``. This tool returns a
        short ``content_hash``—pass that hash into ``update_channel_profile`` to
        guarantee you are editing the latest state.
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("🧭 channel identity profile")

        return await ctx.deps.channel_profile_repo.get_profile()

    @assistant_agent.tool
    async def get_channel_profile_advice(
        ctx: RunContext[LoopieDeps],
    ) -> ChannelProfileAdvice:
        """Return guidance for channel profile improvements.

        Use this when the user is discussing channel profile improvements or
        editing and consult it to advise them before applying edits.
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("🧭 channel profile guidance")

        return load_channel_profile_advice()

    @assistant_agent.tool
    async def update_channel_profile(
        ctx: RunContext[LoopieDeps],
        patch: ChannelProfilePatch,
        content_hash: str,
    ) -> ChannelProfileSnapshot:
        """Apply a patch to the stored channel profile after reading it.

        ``content_hash`` must come from the most recent ``get_channel_profile``.
        If the hash mismatches, you must read the profile again before editing.

        Only send the fields that changed in ``patch`` (partial update).
        """

        if ctx.deps.tool_call_notifier:
            await ctx.deps.tool_call_notifier("🧭 updating channel profile")

        return await ctx.deps.channel_profile_repo.update_profile(
            patch, content_hash
        )

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


def build_smart_entry_agent(
    active_settings: Settings,
) -> Agent[LoopieDeps, str] | None:
    """Build the agent configured for smart journal updates."""
    return build_agent(
        active_settings,
        system_prompt=_load_promptdown_system_message("smart_entry.prompt.md"),
    )
