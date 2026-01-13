## Goals
- Unify journal viewing + editing into a single Typora-like experience (single surface with live preview, no split panes/mode switcher, minimal UI distractions while writing).
- Replace raw markdown textareas with a Typora-style live preview editor (no separate WYSIWYG-only mode).
- Create new entries from a dedicated journal detail view.
- Auto-save title/content with a debounce while typing.
- Preserve existing entry data model; `summary` remains the canonical Markdown content field (no new content column).

## Non-goals (for now)
- Collaborative editing or multi-user cursors.
- Replacing smart prompt flows or smart update scheduling.
- Building a full formatting toolbar beyond essential shortcuts.
- A standalone WYSIWYG rich-text editor that abandons Markdown.

## Background
Today, standard journal entries are edited in `ActivityDraftCard` with a title input + raw markdown textarea. The journal detail page is read-only by default and requires “Edit entry” to switch into a form. This splits reading and editing, and exposes raw markdown during edits.

Typora-style editing removes the split view and lets users edit directly in a clean, live-preview Markdown surface. Milkdown is a plugin-driven Markdown editor inspired by Typora and built on ProseMirror/Remark, which fits this experience.

## Proposed UX
### Journal Detail (existing entry)
- The content area is always a Typora-style live preview editor showing formatted Markdown (no separate edit mode).
- Clicking anywhere in the content area places the caret and allows editing immediately.
- Title is inline-editable (input styled like the current header typography).
- No “Edit entry” button — just type. Pin/unpin and delete remain.
- Autosave runs on debounce after edits to title or content. Show a `save-off` icon near the title only while dirty/saving; animate/bounce the icon while saving and provide a tooltip explaining the state.
- Always save locally before attempting remote save; if the user goes offline, keep local edits queued for sync.
- When offline, keep the editor enabled but disable server-only actions (pin/delete/edit prompt) and show an offline tooltip/banner.

### Journal Detail (new entry)
- `+ entry` in the activity feed navigates to `/journals/new` (no ID yet).
- The title field is empty and focused; content editor is visible but read-only until created.
- Title edits are in-memory only and are not saved locally until the entry has an ID.
- Once the user enters a title, a **Create** button appears next to the title.
- If offline, disable the Create button with tooltip copy (“Go online to create”).
- Clicking **Create** (online only):
  - Generates a UUID and calls `POST /entries`.
  - Navigates to `/journals/:id` and unlocks the content editor.
  - Focuses the content editor so the user can start typing immediately.

### Smart entries
- The “Prompt” tab remains for smart prompt editing.
- Always show an “Edit prompt” action, even when viewing the Content tab.
- The “Content” tab uses the new editor for manual edits once content exists.
- When smart updates are streaming (initial or refresh), lock title + content + prompt actions and show a tooltip explaining why editing is disabled.

## Editor Behavior (Typora-inspired)
- Single surface: no separate preview mode or raw markdown toggle.
- Markdown shortcuts (e.g., `#` for heading, `-` for list, ``` for code) render as rich text.
- Common shortcuts work (`cmd/ctrl+b` bold, `cmd/ctrl+i` italic, `cmd/ctrl+k` link, list toggles).
- Minimal UI: no heavy toolbar; keep the page clean and content-first.
- Show a lightweight floating format bar on all platforms when text is selected; actions: bold, italic, strikethrough. Hide when selection collapses or the editor blurs.
- Markdown features must include: headings, bold, italic, strikethrough, blockquotes, inline code, code fences, ordered lists, unordered lists, task lists, tables, links, images, horizontal rules.
- Drag/drop or paste images/files uploads and inserts Markdown links (reuse `useAssetUpload`).

## Data & State Flow
### Read
- `JournalDetailPage` loads entry via `entriesQueries.byId` as today.
- Editor initializes with `entry.summary` (markdown string; canonical content field).
- Title input initializes with `entry.title`.

### Write (debounced autosave)
- Editor changes update local state immediately.
- Debounce interval: 1000ms after the last change.
- Autosave always persists locally first (IndexedDB sync store for updates), then triggers remote `entriesMutations.update` when online with:
  - `id`
  - `title`
  - `summary` (markdown content; no new fields)
- Show a `save-off` icon only while dirty/saving; animate/bounce it while saving and add a tooltip explaining the state.
- If the update fails, turn the `save-off` icon red and show tooltip text (“Saved locally, couldn’t sync yet”). Retry on the next debounce only.
- Prevent stale saves from overwriting newer ones by tracking an incrementing `saveVersion` and only applying the latest response.

## Technical Plan
### New Components/Hooks
- `JournalEntryEditor` (new): wraps Milkdown editor with Storyloop styles and emits markdown on change.
- `useDebouncedAutosave` (new): takes draft state, debounces, calls `entriesMutations.update`.
- `EditableTitle` (new or inline in `JournalDetailPage`): input styled like `<h1>`.

### Modified Files
- `frontend/src/pages/JournalDetailPage.tsx`
  - Replace `ActivityDraftCard` edit mode with `JournalEntryEditor` + autosave.
  - Add support for `/journals/new` draft state.
  - Remove “Edit entry” button in favor of Create + autosave status + `save-off` icon.
- `frontend/src/components/ActivityFeed.tsx` + `frontend/src/App.tsx`
  - Update `+ entry` flow to navigate to `/journals/new` instead of rendering inline draft.
  - Keep smart entry creation flow in-feed.
- `frontend/src/hooks/useEntryEditing.ts`
  - Deprecate or reduce usage for journal detail editing; keep for feed edits or refactor into autosave hook.
- `frontend/src/lib/sync/*` + `frontend/src/context/SyncContext.ts`
  - Extend offline sync to queue entry updates (not just creates).
  - Add a `queueEntryUpdate` method and handle update sync ordering.

### Milkdown Integration
- Use Milkdown (https://milkdown.dev, https://github.com/Milkdown/milkdown) as the Typora-inspired live preview editor.
- This is still Markdown-first; we are not building a separate WYSIWYG rich-text editor.
- Use Milkdown core + a GFM/remark-compatible preset to enable tables, task lists, and strikethrough.
- Use Milkdown commands/keymaps for bold/italic/strikethrough shortcuts; if a floating menu plugin exists, reuse it, otherwise implement a tiny custom menu.
- Use a custom theme or CSS that matches `MarkdownMessage` typography and spacing.
- On editor update, emit markdown to the autosave hook.
- Disable editor only while smart updates are streaming; when offline, keep the editor enabled and rely on local-first saves.

## Edge Cases
- Ensure autosave doesn’t fire on initial load (only after edits).
- Avoid overwriting local edits with query refetches while typing.
- When creating a new entry, block autosave until the entry exists.
- For smart entries, prevent autosave while SSE stream is updating content.
- If remote saves arrive out of order, ignore older responses based on `saveVersion`.

## Analytics/Telemetry (optional)
- Track `journal_editor_opened`, `journal_editor_saved`, `journal_editor_error` for UX validation.

## Documentation Follow-up
- After implementation, update `thinking/specs/offline-sync.md` to include queued entry updates and the “online-only create” rule for `/journals/new`.

## Open Questions
- None for now.

## Implementation Notes
- Implemented Milkdown with the GFM preset and a small custom selection toolbar (bold/italic/strikethrough) instead of a full toolbar plugin.
- Autosave writes to IndexedDB before remote sync by queueing update records in the sync store; remote saves clear the queued update when the latest version is confirmed.
- `/journals/new` creation is online-only with a read-only editor until the entry is created to keep updates tied to a real entry ID.
