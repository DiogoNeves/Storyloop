# YouTube service refactoring overview

This audit highlights three structural refactors that would make `backend/app/services/youtube.py` easier to maintain, safer to extend, and more predictable in production. Each item is expanded in its own companion document under `refactoring-report/`.

1. **Untangle channel identifier parsing.** The `_candidate_channel_params` helper currently mixes whitespace trimming, URL parsing, and heuristic fallbacks in one long function, which makes it hard to reason about what identifiers are attempted and in which order (see detailed rationale in `channel-identifier-resolution.md`).
2. **Harden response parsing before constructing dataclasses.** `_request_json`, `_try_resolve_channel`, and `_fetch_videos` assume ideal API responses and hydrate dataclasses in-line, which hides validation gaps and repeated logic (explained in `response-parsing-and-validation.md`).
3. **Introduce a reusable HTTP client boundary.** `fetch_channel_videos` spins up a brand-new `httpx.AsyncClient` for every call, leaving no hook for connection reuse, instrumentation, or integration tests that want to inject a client (covered in `http-client-lifecycle.md`).

Prioritizing these refactors will shrink the module’s complexity surface while giving future feature work—such as playlist pagination or richer error handling—a sturdier foundation.
