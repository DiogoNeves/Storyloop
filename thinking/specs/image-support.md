# Image and File Support (Journal + Loopie)

## Goals
- Allow users to upload images and PDFs in journal entries and Loopie turns.
- Render images inline in markdown; render non-images as file cards.
- Persist files on disk under the database directory with minimal metadata in SQLite.
- Feed uploaded images and extracted PDF text into Loopie (multimodal).
- Keep markdown content portable by storing relative asset URLs.

## Non-goals (for now)
- Audio uploads.
- Asset reference counting and garbage collection.
- Exporting markdown with absolute asset URLs.

## Storage
- Assets root: `db_dir/assets/` where `db_dir` is the parent of the SQLite file.
- Keep only the resized image (max 2000px on longest edge).
- PDFs stored as-is.
- Asset ID is the SHA-256 hash (hex) of the stored bytes.
- Filenames on disk use the hash as the basename (no reference-counting).

### Tables
`assets`
- `id` TEXT PRIMARY KEY  -- SHA-256 hash (hex)
- `original_filename` TEXT NOT NULL
- `mime_type` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `extracted_text` TEXT NULL (PDF only)

Notes:
- Size and dimensions are derived on demand from the file and are not stored.
- The storage path is derived from `db_dir/assets/{id}`.

## API
### POST /assets
- Content-Type: multipart/form-data
- Fields: `file` (required)
- Accepts: image/*, application/pdf
- Returns JSON:
  - `id`, `url` (relative `/assets/{id}`), `filename`, `mimeType`,
    `sizeBytes`, `width`, `height`, `markdown` (suggested snippet),
    `alreadyExists` (boolean)
- Behavior:
  - Images resized to max 2000px on the longest edge before saving.
  - PDFs are stored and text is extracted via `pypdf` into `extracted_text`.
  - Hash computed from the stored bytes (post-resize for images).
  - If an asset with the same hash exists, return `200` with
    `alreadyExists: true` and the existing asset payload.
  - Note: without a client-provided hash, the server must read the full upload
    to compute the hash before it can dedupe.

### POST /assets/{id}
- `id` is the client-computed SHA-256 hash (hex) of the stored bytes.
- Same request/response shape as `POST /assets`.
- Behavior:
  - If an asset with `id` already exists, return `200` with
    `alreadyExists: true` and skip writing the body.
  - If new, store the asset and verify the computed hash matches `id`.
  - If the hash does not match, return `400` and do not persist the file.

### GET /assets/{id}
- Streams file bytes with correct Content-Type.

### GET /assets/{id}/meta
- Returns JSON: `id`, `filename`, `mimeType`, `sizeBytes`, `width`, `height`.
- Can be used as a preflight check if the client computes the hash locally.

### DELETE /assets/{id} (optional, not required for v1)
- Removes file + metadata (no ref counting in v1).

## Markdown and URL Strategy
- Store relative paths in markdown: `/assets/{id}`.
- In the frontend renderer, rewrite asset URLs to `API_BASE_URL` so images and
  files resolve regardless of domain/port.
- This keeps stored content portable across environments.

## Journal Entries
### Editing
- Add an "Add image" button and drag/drop/paste in the editor.
- On upload success:
  - For images: insert `![alt](/assets/{id})` at cursor.
  - For PDFs: insert `[filename](/assets/{id})` at cursor.

### Persistence
- When reading entries, parse markdown to detect asset references.
- Extend agent-facing model:
  - `JournalEntry.attachments[]` includes `{id, filename, mime_type, url, width, height, extracted_text}`.

## Loopie Turns
### UI
- Add drag/drop/paste and an "Add image" button in `LoopiePanel`.
- Show attachment previews with remove before sending.
- For PDFs, show a file card preview.

### Backend
- Extend turn input to accept `attachments` (array of asset IDs).
- Store attachments on the turn record as JSON (`turns.attachments`).
- Extend turn output with `attachments` metadata for rendering.

## Rendering
- Add custom markdown renderers for `img` and `a`:
  - `img` pointing to `/assets/` renders inline, src rewritten to `API_BASE_URL`.
  - `a` pointing to `/assets/` renders a file card for non-images (requires meta).
- Keep markdown parsing simple (no extra syntax beyond standard links/images).

## Agent (PydanticAI Multimodal)
Reference: https://ai.pydantic.dev/input/

### Latest user turn only
- Only include attachments from the latest user turn in the multimodal input.
- For images: load bytes from disk, encode as base64 data URL, pass as image
  content parts to the model.
- For PDFs: include extracted text as an extra text part, labeled with filename.

### Journal entry attachments
- When `load_journal_entries` is called, return `attachments` metadata plus
  `extracted_text` (for PDFs) in `JournalEntry`.
- Include journal entry images in the model input when the tool is invoked:
  - Preferred: use PydanticAI content parts that allow images in tool responses.
  - Fallback: append an extra user message after tool execution with the
    journal images as content parts.

### Implementation notes
- Replace `render_history_prompt` with multimodal message construction.
- Use a data URL strategy so OpenAI can see images without public URLs.
- Keep a text-only fallback if multimodal input is unavailable.

## Demo Mode
- When demo mode is enabled, do not write assets to disk.
- Optionally provide seeded demo assets (solid colors/patterns) later.

## Frontend Changes
- Add an assets client module (`uploadAsset`, `getAssetMeta`).
- Add a small hook to handle upload state and insertion at cursor.
- Update `MarkdownMessage` to rewrite `/assets/` URLs to `API_BASE_URL`.
- Update `LoopiePanel` to accept and send attachments.

## Backend Changes
- Add asset service + router with resize and PDF extraction.
- Derive assets directory from configured database path.
- Add asset table migration and a `turns.attachments` column migration.
- Extend conversation turn models to include attachments.
- Extend agent journal models to include attachments metadata.

## Open Questions (resolved)
- Use relative URLs in markdown and rewrite in UI (portable across domains).
- Resized images only; no original retention.
- Use `pypdf` for PDF text extraction.
- Do not implement ref counting or cleanup in v1.
