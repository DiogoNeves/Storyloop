# Refactor Plan: ActivityFeed Component Extraction

## Overview

Extract `ActivityFeedItem` and `ActivityDraftCard` components from `ActivityFeed.tsx` into separate files to improve maintainability, testability, and code organization.

## Current State

**File:** `frontend/src/components/ActivityFeed.tsx`

- **Lines:** 498 (before refactoring)
- **Components:** 3 (before refactoring)
  - `ActivityFeed` (main orchestrator, ~164 lines)
  - `ActivityFeedItem` (display component, ~133 lines)
  - `ActivityDraftCard` (form component, ~122 lines)
- **Additional:** Types, interfaces, constants

## ✅ Completed State

**File:** `frontend/src/components/ActivityFeed.tsx`

- **Lines:** 218 (after refactoring - reduced from 498)
- **Components:** 1 (main orchestrator only)
- **Status:** ✅ Completed - Components extracted successfully

**New Files Created:**

- `frontend/src/components/ActivityFeedItem.tsx` (~140 lines)
- `frontend/src/components/ActivityDraftCard.tsx` (~140 lines)

## Problem Statement

The file contains too many components, making it:

- Hard to navigate and understand
- Difficult to test components in isolation
- Challenging for parallel development
- Violating single responsibility principle

## Goal

Separate concerns by extracting `ActivityFeedItem` and `ActivityDraftCard` into their own files, reducing `ActivityFeed.tsx` to ~180 lines focused solely on orchestration.

## Files to Create

### 1. `frontend/src/components/ActivityFeedItem.tsx`

**Purpose:** Display individual activity items in the feed

**Content:**

- `ActivityFeedItem` component (lines 221-354)
- `categoryBadgeClass` constant (lines 356-360)
- Props interface (inline or extracted)

**Dependencies:**

- `@/lib/types/entries` - ActivityItem type
- `@/components/ui/*` - Card, Badge, Button components

**Exports:**

- `ActivityFeedItem` component

### 2. `frontend/src/components/ActivityDraftCard.tsx`

**Purpose:** Form component for creating/editing entries

**Content:**

- `ActivityDraftCard` component (lines 376-497)
- `ActivityDraftCardProps` interface (lines 362-374)
- `ActivityDraft` type import (from ActivityFeed.tsx)

**Dependencies:**

- `@/components/ActivityFeed` - ActivityDraft type (or consider moving to types)
- `@/lib/types/entries` - ActivityItem category type
- `@/components/ui/*` - Card, Badge, Input, Label, Textarea, Button components

**Exports:**

- `ActivityDraftCard` component
- `ActivityDraftCardProps` interface (if needed externally)

### 3. Updated `frontend/src/components/ActivityFeed.tsx`

**Purpose:** Main feed orchestrator

**Changes:**

- Import `ActivityFeedItem` from `./ActivityFeedItem`
- Import `ActivityDraftCard` from `./ActivityDraftCard`
- Remove extracted component definitions
- Keep `ActivityFeed` component logic
- Keep `ActivityDraft` interface (exported)
- Keep `ActivityFeedProps` interface

**Final size:** 218 lines (down from 498) ✅ Achieved

## Migration Steps

### Step 1: Create ActivityFeedItem.tsx

1. Create new file `frontend/src/components/ActivityFeedItem.tsx`
2. Copy `ActivityFeedItem` component (lines 221-354)
3. Copy `categoryBadgeClass` constant (lines 356-360)
4. Add necessary imports
5. Export component

### Step 2: Create ActivityDraftCard.tsx

1. Create new file `frontend/src/components/ActivityDraftCard.tsx`
2. Copy `ActivityDraftCard` component (lines 376-497)
3. Copy `ActivityDraftCardProps` interface (lines 362-374)
4. Import `ActivityDraft` type from `@/components/ActivityFeed`
5. Import `categoryBadgeClass` from `@/components/ActivityFeedItem` (or keep local)
6. Add necessary imports
7. Export component and props interface

### Step 3: Update ActivityFeed.tsx

1. Add imports for extracted components
2. Remove `ActivityFeedItem` component definition
3. Remove `ActivityDraftCard` component definition
4. Remove `ActivityDraftCardProps` interface
5. Remove `categoryBadgeClass` constant (import from ActivityFeedItem if needed)
6. Verify all component usage still works

### Step 4: Verify Exports

1. Ensure `ActivityDraft` type is still exported from ActivityFeed.tsx
2. Check that `ActivityFeedItem` and `ActivityDraftCard` are properly exported
3. Verify imports in App.tsx and useEntryEditing.ts still work

### Step 5: Testing

1. Run `make test-frontend` to ensure no regressions
2. Manually test component rendering
3. Verify draft creation/editing still works
4. Check YouTube integration still functions

## Type Decisions

### ActivityDraft Interface

**Decision:** Keep in `ActivityFeed.tsx` for now

**Rationale:**

- Currently only used by ActivityFeed and ActivityDraftCard
- ActivityDraftCard imports it from ActivityFeed
- Can move to `@/lib/types/entries.ts` later if needed elsewhere

### categoryBadgeClass Constant

**Decision:** Move to `ActivityFeedItem.tsx`

**Rationale:**

- Used by both ActivityFeedItem and ActivityDraftCard
- ActivityDraftCard can import from ActivityFeedItem
- Better than duplicating or creating shared constants file prematurely

## Implementation Notes

### Import Paths

- Use relative imports for same directory: `./ActivityFeedItem`
- Use absolute imports for other modules: `@/lib/types/entries`

### Shared Constants

- `categoryBadgeClass` will be exported from `ActivityFeedItem.tsx` if needed elsewhere
- ActivityDraftCard imports it: `import { categoryBadgeClass } from './ActivityFeedItem'`

### Backward Compatibility

- All public exports from ActivityFeed.tsx remain unchanged
- `ActivityDraft` type still exported from ActivityFeed.tsx
- No breaking changes to consumers (App.tsx, useEntryEditing.ts)

## Expected Outcomes

### Before

```
ActivityFeed.tsx (498 lines)
├── ActivityFeed component
├── ActivityFeedItem component
├── ActivityDraftCard component
├── Types and interfaces
└── Constants
```

### After

```
ActivityFeed.tsx (~180 lines)
├── ActivityFeed component
├── ActivityDraft interface (exported)
└── ActivityFeedProps interface

ActivityFeedItem.tsx (~140 lines)
├── ActivityFeedItem component
└── categoryBadgeClass constant

ActivityDraftCard.tsx (~140 lines)
├── ActivityDraftCard component
└── ActivityDraftCardProps interface
```

## Benefits

1. **Improved Maintainability**

   - Smaller, focused files
   - Easier to locate specific components
   - Clearer component boundaries

2. **Better Testability**

   - Components can be tested independently
   - Easier to mock dependencies
   - More focused test suites

3. **Enhanced Reusability**

   - Components can be imported separately
   - ActivityDraftCard could be used in other contexts
   - ActivityFeedItem could be reused in different feeds

4. **Reduced Complexity**
   - Each file has single responsibility
   - Easier to understand component purpose
   - Lower cognitive load

## Risks & Mitigations

### Risk: Breaking Imports

**Mitigation:** Verify all imports after extraction, test thoroughly

### Risk: Type Export Issues

**Mitigation:** Ensure ActivityDraft type remains accessible from ActivityFeed.tsx

### Risk: Circular Dependencies

**Mitigation:** ActivityDraftCard imports ActivityDraft from ActivityFeed (one-way dependency)

## Future Considerations

1. Consider extracting YouTube connection UI into `YouTubeChannelConnect.tsx` if it grows
2. Consider moving `ActivityDraft` type to `@/lib/types/entries.ts` if used more widely
3. Consider creating shared constants file if more constants emerge

## Success Criteria

- ✅ All components extracted to separate files
- ✅ ActivityFeed.tsx reduced to ~180 lines
- ✅ All tests pass
- ✅ No breaking changes to public API
- ✅ Components remain fully functional
- ✅ Code is easier to understand and maintain
