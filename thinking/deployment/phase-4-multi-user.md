# Phase 4 - Multi-User Data Model and Isolation

## Goal

Evolve from single-user assumptions to strict multi-user isolation after storage is cloud-native.

## Scope

- Introduce `user_id` ownership for user data entities
- Enforce user scoping in every read/write path
- Remove hardcoded "active" user behavior
- Migrate legacy single-user records into a user-scoped model

## Product behavior target

Keep UX close to current behavior:
- each user sees their own entries, conversations, settings, assets
- no cross-user leakage
- same workflows, now tied to account identity

## Verification checklist

- `make test` and `make build` pass
- Cross-user isolation tests (user A cannot read/write user B data)
- Query-level user scoping verified on all persistence paths
- Auth identity to DB ownership mapping verified
- Legacy data migration assigns ownership deterministically
- Manual two-user end-to-end smoke test passes

## Exit criteria

Multi-user isolation is enforced at API, service, and storage layers with no known leakage paths.
