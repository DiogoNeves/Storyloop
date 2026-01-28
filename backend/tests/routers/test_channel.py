import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


@pytest.mark.asyncio
async def test_get_channel_profile_returns_empty() -> None:
    settings = Settings.model_validate(
        {"DATABASE_URL": "sqlite:///:memory:", "YOUTUBE_API_KEY": "test-key"}
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            response = await client.get("/channel/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"] is None
    assert payload["updatedAt"] is None


@pytest.mark.asyncio
async def test_put_channel_profile_persists_payload() -> None:
    settings = Settings.model_validate(
        {"DATABASE_URL": "sqlite:///:memory:", "YOUTUBE_API_KEY": "test-key"}
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    profile_payload = {
        "audienceFocus": "Serve indie filmmakers leveling up their edits.",
        "personalConnectionConfirmed": True,
        "personalConnectionNotes": "I edit weekly and know this pain.",
        "bucketsLocked": True,
        "bucketsLockedNotes": "These feel coherent.",
        "audienceBuckets": [
            {
                "id": "bucket-1",
                "name": "Solo filmmakers",
                "description": "Creators editing alone after work.",
                "careAndUnderstanding": "I care about their limited time.",
                "careAndUnderstandingConfirmed": True,
                "otherCreatorsWatched": "Film Riot, Indy Mogul",
                "personalConnection": True,
                "personalConnectionNotes": "Lived this stage for years.",
                "valueEmotion": "Relief",
                "valueAction": "Open their edit timeline tonight.",
                "valueSpecific": True,
                "valueRealistic": True,
                "valueRepeatable": True,
                "valueNotes": "Keep it focused on one workflow.",
            }
        ],
    }

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            update_response = await client.put(
                "/channel/", json=profile_payload
            )
            followup = await client.get("/channel/")

    assert update_response.status_code == 200
    update_payload = update_response.json()
    assert (
        update_payload["profile"]["audienceFocus"]
        == profile_payload["audienceFocus"]
    )
    assert update_payload["updatedAt"] is not None

    assert followup.status_code == 200
    followup_payload = followup.json()
    assert (
        followup_payload["profile"]["audienceBuckets"][0]["name"]
        == "Solo filmmakers"
    )
