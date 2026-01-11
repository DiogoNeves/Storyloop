# Smart Journal Entries

## Goals
- Let creators set a reusable prompt for ongoing journal updates.
- Run updates in the background on a schedule and on demand.
- Stream smart updates to the UI when a viewer is connected.
- Keep entry ordering and timestamps aligned with update completion.

## Non-goals (for now)
- Persisting a background job queue across restarts.
- Allowing smart updates for content entries.
- Storing computed prompt output separately from the journal entry.
- Handling cross-device conflicts for simultaneous updates.

## Data Model

New entry fields stored in SQLite:
- `prompt_body` (TEXT, nullable) — required to mark an entry as smart.
- `prompt_format` (TEXT, nullable) — optional format guidance.
- `updated_at` (TEXT, non-null) — last time the entry content changed.
- `last_smart_update_at` (TEXT, nullable) — last background run completion timestamp.

Migration strategy: add missing columns on startup (`EntryService.ensure_schema`) and backfill `updated_at = occurred_at` for existing rows.

## Update Rules
- `prompt_body` is required whenever `prompt_format` is provided.
- Smart update runs should only set `updated_at` after completion.
- `last_smart_update_at` is updated after every smart run (even if no edits).
- Entry ordering uses `updated_at` (pinned entries still float).

## Backend Flow

### Triggers
- Create a smart entry (prompt supplied).
- Edit smart prompt (promptBody or promptFormat changed).
- Hourly scheduler refreshes entries older than 24 hours.

### Scheduler
- APScheduler runs hourly with `max_instances=1` and `coalesce=True`.
- Enabled by default via `SMART_ENTRIES_SCHEDULER_ENABLED=true`.
- Concurrency limited to 3 updates at a time.

### Streaming Endpoint
`POST /entries/{entry_id}/smart/stream`

Server-Sent Events emitted:
- `token`: `{ "token": "..." }`
- `tool_call`: `{ "message": "..." }`
- `done`: `{ "entry_id": "...", "text": "..." }`
- `error`: `{ "message": "..." }`

## Frontend UX

### Activity Feed
- Toggle switch for Smart entry creation.
- Smart entries show a `Bot` badge and a “Loopie is preparing…” placeholder when empty.

### Journal Detail
- Tabs: `Content` (default) and `Prompt`.
- Content tab streams updates while running; shows “waiting for first update” state.
- Prompt tab displays prompt + format and allows edits or “Stop smart updates”.
- Header shows `Loopie updated <date>` and tooltip for original created date.

### Offline
- Smart entry creation queues offline like standard entries.
- Detail view shows “Loopie will update once you’re back online.”

## Testing Notes
- Update backend unit tests for new `EntryRecord` fields.
- Validate SSE stream parsing and prompt validation in UI.
