# Agent Journal Edits

## Summary
Enable Loopie to create and edit journal entries via tools, with strict read-before-edit protection using a short content hash. Tool calls must render inline in the chat stream at the exact position they occur (text → tool → text).

## Goals
- Add agent tools to read, create, and edit journal entries.
- Enforce read-before-edit using a short hash of current content.
- Render tool usage inline in streamed chat so the user sees when the agent reads/writes.
- Keep entry validation aligned with existing Pydantic validations.

## Non-Goals (for now)
- Version history or automatic rollback of edits.
- Rich diffing or merge support.
- Editing non-journal entries.

## Tooling Contract

### `read_journal_entry`
**Purpose:** Load a specific journal entry for editing or quoting.

**Inputs**
- `entry_id: str`

**Outputs**
- `id: str`
- `title: str`
- `summary: str`
- `occurred_at: str` (ISO)
- `content_hash: str` (blake2s, truncated to 12 hex chars)

**Notes**
- Hash is computed over `title + "\n" + summary` after trimming (same normalization as validation).
- The hash is a short-lived concurrency token, not a security feature.

### `edit_journal_entry`
**Purpose:** Persist updates to an existing journal entry.

**Inputs**
- `entry_id: str`
- `content_hash: str` (must match current entry content)
- `title: str`
- `summary: str`

**Behavior**
- Validate `title` and `summary` via Pydantic (same rules as existing entry update).
- If the hash mismatches, return a clear error: "Entry changed since last read. Please read again before editing."
- On success, return updated entry (same shape as `read_journal_entry`, with a new `content_hash`).

### `create_journal_entry`
**Purpose:** Create a new journal entry.

**Inputs**
- `title: str`
- `summary: str`
- `occurred_at: str` (ISO; optional — default to now)

**Behavior**
- Validate `title` and `summary` via Pydantic.
- Create a new entry record and return the entry with `content_hash`.

## Hashing Details
- Algorithm: `blake2s`
- Output: first 12 hex characters
- Input string: `normalized_title + "\n" + normalized_summary`
- Normalization: identical to Pydantic validators (trim whitespace, reject empty title).

## Streaming + UX Requirements
- Tool call events must render inline at the moment they happen in the assistant stream.
- The assistant can output text, then a tool call, then more text without losing order.
- Tool call UI should persist in the chat history (not transient-only).

## Retry / Backtracking Guidance
- On hash mismatch, the agent must re-read and reapply the edit.
- Full rollback/versioning is deferred; optimistic concurrency is enough for v1.

## Implementation Notes
- Reuse `EntryService` / existing entry routes for persistence and validation.
- Add a hash field to agent-facing journal entry model.
- Ensure tool docstrings explain the read-before-edit requirement.
- Update frontend streaming flow to interleave tool call messages with assistant text.

## Testing
- Unit: hash generation and mismatch error.
- Service: edit/create tools validate and persist correctly.
- UI: tool call events render inline and persist within a streamed response.
