from app.services.agent import LoopieDeps
from app.services.agent_tools.repositories import (
    EmptyChannelProfileRepository,
    EntryRepository,
    JournalRepository,
    TodayRepository,
    YouTubeRepository,
)


class _EntryService:
    def list_entries(self):
        return []


class _YoutubeService:
    async def fetch_channel_feed(self, *args, **kwargs):
        raise NotImplementedError

    async def fetch_video_detail(self, *args, **kwargs):
        raise NotImplementedError


class _UserService:
    def get_active_user(self):
        return None


class _OAuthService:
    pass


def test_loopie_deps_accepts_repository_instances():
    deps = LoopieDeps(
        user_id="user-123",
        entry_repo=EntryRepository(_EntryService()),
        journal_repo=JournalRepository(_EntryService()),
        today_repo=TodayRepository(_EntryService()),
        youtube_repo=YouTubeRepository(
            _YoutubeService(),
            _UserService(),
            _OAuthService(),
        ),
        channel_profile_repo=EmptyChannelProfileRepository(),
    )

    assert deps.user_id == "user-123"
    assert isinstance(deps.journal_repo, JournalRepository)
    assert isinstance(deps.today_repo, TodayRepository)
    assert isinstance(deps.youtube_repo, YouTubeRepository)
