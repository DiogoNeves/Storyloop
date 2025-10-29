# Refactor: Normalize Channel Identifiers via a Parser Object

## Summary
Replace `_candidate_channel_params` with a dedicated identifier parser (e.g., `ChannelIdentifier`) that exposes structured accessors for channel IDs, handles, usernames, and URL-derived signals. The parser should handle query strings, short links, and video/playlist URLs, returning canonical lookup candidates in priority order.

## Why this matters
- **Edge cases** – The current generator embeds complex branching logic, yet still misses common shapes like video URLs where the `v` parameter is the only useful clue.【F:backend/app/services/youtube.py†L101-L142】
- **Clarity** – Encapsulating parsing rules in a class with named methods (e.g., `from_url`, `candidate_params()`) makes the resolution pipeline self-documenting and easier to extend when YouTube introduces new URL forms.
- **Validation** – A parser object can perform upfront validation and expose typed properties, reducing downstream defensive code and preventing silent fallbacks.

## Step-by-step outline
1. Introduce a `ChannelIdentifier` dataclass responsible for parsing the raw input string into normalized parts (handle, channel ID, username, video ID, playlist ID, etc.). Include helpers to strip query/fragment components.
2. Implement methods such as `candidate_params()` that yield dictionaries for the YouTube API, replacing `_candidate_channel_params`. Keep ordering explicit and deduplicate inside the parser.
3. Update `_resolve_channel` to instantiate the parser once and iterate through the returned candidates. Log which strategy succeeded to aid debugging.
4. Add focused unit tests that cover all supported identifier shapes: bare IDs, `@handle`, custom usernames, channel URLs with query params, video URLs, playlist URLs, and malformed inputs.

## Before / After Preview
```python
# Before: ad-hoc branching hidden inside the service module
def _candidate_channel_params(identifier: str) -> Iterable[dict[str, str]]:
    ...
```

```python
# After: dedicated parser object with explicit API
identifier = ChannelIdentifier.parse(raw_identifier)
for params in identifier.candidate_params():
    ...
```

This refactor narrows the parsing responsibility to a well-tested component, letting the service focus on resolution flow rather than string surgery.
