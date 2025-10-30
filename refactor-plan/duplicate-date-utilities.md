# Refactor Plan: Consolidate Date Formatting Utilities

## Overview

Consolidate duplicate date formatting utilities into a shared utility module to reduce code duplication and improve maintainability.

## Current State

Three similar date formatting functions exist across the codebase:

1. **App.tsx** (lines 179-186)

   ```typescript
   const formatNowAsDateTimeLocal = useCallback(() => {
     const now = new Date();
     now.setSeconds(0);
     now.setMilliseconds(0);
     const offset = now.getTimezoneOffset();
     const adjusted = new Date(now.getTime() - offset * 60_000);
     return adjusted.toISOString().slice(0, 16);
   }, []);
   ```

2. **NewEntryDialog.tsx** (lines 29-41)

   ```typescript
   function roundDateToMinute(date: Date) {
     const rounded = new Date(date);
     rounded.setMilliseconds(0);
     rounded.setSeconds(0);
     return rounded;
   }

   function formatDateLocal(date: Date) {
     const rounded = roundDateToMinute(date);
     const offset = rounded.getTimezoneOffset();
     const adjusted = new Date(rounded.getTime() - offset * 60_000);
     return adjusted.toISOString().slice(0, 16);
   }
   ```

3. **useEntryEditing.ts** (lines 149-156)
   ```typescript
   function toDateTimeLocalInput(date: string) {
     const original = new Date(date);
     original.setSeconds(0);
     original.setMilliseconds(0);
     const offset = original.getTimezoneOffset();
     const adjusted = new Date(original.getTime() - offset * 60_000);
     return adjusted.toISOString().slice(0, 16);
   }
   ```

## Problem Statement

- **Code duplication** across three files
- **Inconsistent naming** (`formatNowAsDateTimeLocal`, `formatDateLocal`, `toDateTimeLocalInput`)
- **Maintenance burden** - changes must be made in multiple places
- **Risk of bugs** - logic may diverge over time

## Goal

Create a single, well-tested utility function in `@/lib/utils.ts` that handles all datetime-local formatting needs.

## Solution

### Create Unified Utility

**File:** `frontend/src/lib/utils.ts`

**Add function:**

```typescript
/**
 * Formats a Date to a datetime-local input string value.
 *
 * Rounds to nearest minute and adjusts for timezone offset.
 * Returns format: "YYYY-MM-DDTHH:mm"
 *
 * @param date - Date object or ISO string to format
 * @returns Formatted datetime-local string
 */
export function toDateTimeLocal(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const rounded = new Date(dateObj);
  rounded.setSeconds(0);
  rounded.setMilliseconds(0);
  const offset = rounded.getTimezoneOffset();
  const adjusted = new Date(rounded.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 16);
}
```

## Migration Steps

### Step 1: Add Utility Function

1. Add `toDateTimeLocal` function to `frontend/src/lib/utils.ts`
2. Include JSDoc documentation
3. Handle both Date and string inputs

### Step 2: Update App.tsx

1. Import `toDateTimeLocal` from `@/lib/utils`
2. Replace `formatNowAsDateTimeLocal` callback with direct call to `toDateTimeLocal(new Date())`
3. Update `handleStartDraft` to use `toDateTimeLocal(new Date())`

### Step 3: Update NewEntryDialog.tsx

1. Import `toDateTimeLocal` from `@/lib/utils`
2. Remove `roundDateToMinute` function
3. Remove `formatDateLocal` function
4. Replace all `formatDateLocal(...)` calls with `toDateTimeLocal(...)`

### Step 4: Update useEntryEditing.ts

1. Import `toDateTimeLocal` from `@/lib/utils`
2. Remove `toDateTimeLocalInput` function
3. Replace `toDateTimeLocalInput(item.date)` with `toDateTimeLocal(item.date)`

### Step 5: Testing

1. Test date formatting with various inputs
2. Verify datetime-local inputs work correctly
3. Test timezone handling
4. Run `make test-frontend`

## Implementation Details

### Function Signature

```typescript
function toDateTimeLocal(date: Date | string): string;
```

**Parameters:**

- `date: Date | string` - Accepts Date object or ISO string

**Returns:**

- `string` - Datetime-local format: "YYYY-MM-DDTHH:mm"

### Why Unified Name?

- `toDateTimeLocal` clearly indicates purpose
- Matches HTML input type (`datetime-local`)
- Consistent with common naming conventions

## Expected Outcomes

### Before

```
App.tsx: formatNowAsDateTimeLocal() (8 lines)
NewEntryDialog.tsx: formatDateLocal() + roundDateToMinute() (13 lines)
useEntryEditing.ts: toDateTimeLocalInput() (8 lines)
Total: ~29 lines of duplicate logic
```

### After

```
lib/utils.ts: toDateTimeLocal() (8 lines)
App.tsx: Import and use (1 line change)
NewEntryDialog.tsx: Import and use (2 line changes)
useEntryEditing.ts: Import and use (1 line change)
Total: ~8 lines + 4 import/usage lines = 12 lines
```

**Reduction:** ~17 lines of duplicate code removed

## Benefits

1. **DRY Principle** - Single source of truth
2. **Consistency** - Same logic everywhere
3. **Maintainability** - Change once, affects all
4. **Testability** - Easier to test isolated utility
5. **Clarity** - Single, well-named function

## Risks & Mitigations

### Risk: Breaking Existing Behavior

**Mitigation:** Function signature matches existing behavior, test thoroughly

### Risk: Timezone Issues

**Mitigation:** Preserve exact same timezone adjustment logic

### Risk: Type Safety

**Mitigation:** Accept both Date and string (common pattern), handle conversion

## Testing Considerations

### Test Cases

1. Date object input
2. ISO string input
3. Current time (now)
4. Past date
5. Future date
6. Timezone edge cases
7. Invalid input handling

### Test File

Create `frontend/src/lib/__tests__/utils.test.ts` if needed, or add to existing test suite.

## Success Criteria

- ✅ Single utility function in `lib/utils.ts`
- ✅ All three files updated to use shared utility
- ✅ Duplicate functions removed
- ✅ All tests pass
- ✅ Functionality unchanged
- ✅ Code is cleaner and more maintainable

## Future Enhancements

1. Consider adding JSDoc examples
2. Consider adding runtime validation for invalid dates
3. Consider adding memoization if performance becomes concern
4. Consider TypeScript-branded types for datetime-local strings
