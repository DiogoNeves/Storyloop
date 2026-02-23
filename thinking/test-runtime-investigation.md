# Test runtime investigation (backend + frontend)

Date: 2026-02-23

## Commands run

- `cd backend && uv run pytest --durations=20 -q`
- `cd frontend && pnpm vitest run --reporter=json --outputFile vitest-report.json`
- `cd frontend && pnpm vitest run --reporter=verbose`

## What is slow

### Backend (overall fast)

- Total runtime: **7.60s** for 138 tests.
- Slowest test by far:
  - `tests/routers/test_speech.py::test_transcribe_audio_returns_413_for_oversized_files` ~0.60s

Why: it intentionally allocates and posts a payload larger than 25MB (`b"a" * ((25 * 1024 * 1024) + 1)`), so request body construction + multipart parsing is the dominant cost.

### Frontend (main bottleneck)

- Total runtime: **60.72s** for 208 tests / 38 files.
- Vitest timing split:
  - transform 4.75s
  - setup 6.47s
  - collect 26.40s
  - tests 27.22s
  - environment 43.59s

Large time is spent in setup/collection/environment, not only assertion execution.

Top slow individual tests (approx):

1. `SettingsDialog.accent.test.tsx` — "renders all accent options and persists the selected accent" (1.9–2.1s)
2. `JournalDetailPage.test.tsx` — "inserts dictated note content and autosaves the entry" (~1.25–1.29s)
3. `JournalDetailPage.test.tsx` — "saves an empty summary when delete-all emits placeholder markdown" (~1.10–1.17s)
4. `App.test.tsx` — "renders the dashboard with mock entries" (~1.13–1.26s)
5. `ActivityFeed.today.test.tsx` — "renders the Today editor by default and hides today card until toggled" (~1.10s)

Top heavy files by summed assertion duration from JSON report:

- `JournalDetailPage.test.tsx` ~5.4s
- `TodayChecklistEditor.test.tsx` ~4.2s
- `SettingsDialog.accent.test.tsx` ~2.5s
- `LoopiePanelMentions.test.tsx` ~2.3s

## Why these tests are slow

1. **Real debounce windows are being waited through**
   - `useDebouncedAutosave` defaults to `debounceMs = 1000`.
   - Slow journal detail tests wait for autosave mutation, which naturally tends toward ~1s+ per scenario.

2. **Large numbers of realistic keyboard interactions**
   - Several tests use `userEvent.type(...)` and keyboard navigation in mention/checklist editors.
   - This is useful behavior coverage, but event-by-event simulation adds runtime.

3. **Repeated async polling-style lookups**
   - e.g., `findBy*` calls in loops (accent options), and multiple `waitFor` blocks for mutation assertions.

4. **High per-file setup overhead in vitest/jsdom**
   - Environment time is very high versus pure test time.
   - Integration-heavy component tests render full app context/providers repeatedly.

5. **Backend oversized upload test does heavy byte allocation by design**
   - It validates true request-size behavior but costs memory/time.

## Improvements that preserve coverage (no reduction in tested behavior)

### Priority 1: make debounce-driven tests deterministic with fake timers

- For tests that are *specifically* asserting autosave behavior, keep assertions identical but run with `vi.useFakeTimers()` and advance time by the debounce period.
- Example pattern:
  - trigger edit
  - `vi.advanceTimersByTime(1000)`
  - assert mutation call
- This preserves behavior coverage while avoiding real-time waiting.

Expected impact: large reductions in `JournalDetailPage.test.tsx` and any autosave-dependent suites.

### Priority 2: reduce sequential `findBy*` waiting where unnecessary

- In accent picker test, once the listbox is open and rendered, prefer synchronous assertions for known-present options (e.g. `getAllByRole('option')` / `getByRole`), rather than looping `await findByRole` for each option.
- Keep the same options coverage and persistence assertion.

Expected impact: medium reduction in `SettingsDialog.accent.test.tsx`.

### Priority 3: keep interaction coverage but cut event volume where irrelevant

- Keep one “full typing realism” test per behavior family.
- For the rest, where per-keystroke timing is not the assertion target, set values with targeted events (or shorter input payloads) and retain the same state-transition assertions.
- Do **not** remove mention-selection, keyboard-nav, or chip-render coverage; only avoid duplicate expensive interaction paths.

Expected impact: medium reduction in checklist/mention suites.

### Priority 4: optimize test environment segmentation

- Split tests into Vitest projects/environments:
  - pure logic hooks/utils tests in `environment: 'node'`
  - DOM-heavy component tests in jsdom
- This keeps assertions unchanged but avoids jsdom cost for non-DOM suites.

Expected impact: broad reduction in total vitest runtime (especially environment/collect phases).

### Priority 5: backend oversized upload test micro-optimization

- Keep the exact boundary assertion (413 on >25MB), but reuse a module-level generated payload fixture to avoid repeated allocation if similar tests are added.
- Since currently there is only one test, impact is small but keeps future growth controlled.

## Suggested next steps

1. Convert 2 slow autosave tests in `JournalDetailPage.test.tsx` to fake timers as a pilot.
2. Refactor accent-options assertion to avoid sequential `findByRole` loop.
3. Add Vitest multi-project config for `node` vs `jsdom` and move pure test files.
4. Re-run:
   - `cd frontend && pnpm vitest run --reporter=verbose`
   - `cd backend && uv run pytest --durations=20 -q`
   and compare before/after totals.
