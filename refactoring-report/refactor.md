# YouTube Service Refactoring Overview

This audit identified three high-impact refactoring initiatives that will make the YouTube integration easier to extend, reason about, and test. Each item below is expanded in its own deep-dive document under `refactoring-report/`.

1. **Isolate HTTP concerns in a dedicated API client** – Consolidate request/response plumbing and error handling in a `YoutubeAPIClient` so the service composes high-level operations without duplicating networking details. See [`api-client-layer.md`](./api-client-layer.md).
2. **Normalize channel identifiers with a parser object** – Replace the sprawling `_candidate_channel_params` generator with an explicit `ChannelIdentifier` parser that understands URLs, handles, query strings, and future identifier shapes. See [`identifier-normalization.md`](./identifier-normalization.md).
3. **Introduce mappers for channel/video payloads** – Centralize the translation from raw API payloads into dataclasses, removing ad-hoc dictionary digging and thumbnail selection scattered across the service. See [`payload-mappers.md`](./payload-mappers.md).

Together these steps shrink the service class, clarify responsibilities, and provide narrow seams for testing fallbacks and edge cases without relying on live API calls.
