# Refactor: Decompose channel identifier resolution

## Why this matters

`_candidate_channel_params` tries to normalize every incoming identifier—raw handles, channel IDs, legacy usernames, and several URL variants—in a single 40+ line function (lines 101-141).【F:backend/app/services/youtube.py†L101-L141】 The blending of trimming, URL parsing, conditional heuristics, and generator semantics creates several pain points:

- **Difficult to verify coverage.** It is not obvious which branch handles cases such as `https://youtube.com/@handle/videos`, `https://www.youtube.com/feeds/videos.xml?channel_id=…`, or watch/short URLs. The current logic silently falls back to the last path segment, which causes incorrect lookups for common share URLs.
- **Implicit ordering.** New heuristics must be inserted in just the right place to avoid starving higher-confidence identifiers. With the logic entwined, a small tweak risks changing the sequence of API calls.
- **Testing friction.** There is no seam to unit test URL normalization separately from deduplication, so behaviour is only verifiable via higher-level async tests.

## What to change

1. Split the responsibilities into focused helpers, e.g. `extract_identifier_from_url`, `generate_lookup_params`, and `normalize_identifier`. Each helper can return structured data (an enum with confidence, the raw identifier type, etc.).
2. Preserve the existing `_unique_dicts` behaviour but move it to operate on richer `LookupCandidate` objects so the service can prioritise by confidence (e.g. `{id: …}` before `{forHandle: …}` even when both exist).
3. Add explicit handling for query parameters (`channel_id`, `user`, `handle`) and video URLs by delegating to a `resolve_video_channel_id` helper that uses the `videos` API when necessary.

## Before

```python
for params in _unique_dicts(_candidate_channel_params(identifier)):
    channel = await self._try_resolve_channel(client, params)
    if channel is not None:
        return channel
```

## After

```python
candidates = build_channel_lookup_candidates(identifier)
for candidate in prioritize_candidates(candidates):
    params = candidate.as_query_params()
    channel = await self._try_resolve_channel(client, params)
    if channel:
        return channel
```

Breaking the workflow into composable stages gives deterministic ordering, unlocks granular tests for each identifier form, and makes future additions (such as supporting `/playlist?list=` URLs or RSS feed links) straightforward.
