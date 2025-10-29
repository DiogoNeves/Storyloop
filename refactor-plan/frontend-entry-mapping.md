# Refactor Plan: Frontend Entry Transformation and Mapping

## Problem Statement

The frontend has type duplication and scattered transformation logic:

1. **Type duplication**: 
   - `Entry` interface in `api/entries.ts` (matches backend response)
   - `ActivityItem` interface in `ActivityFeed.tsx` (component-specific shape)
   - Fields are identical but types are separate

2. **Scattered mapping logic**:
   - `App.tsx` maps `Entry[]` → `ActivityItem[]` (lines 147-161)
   - `ActivityFeed.tsx` maps `YoutubeFeedResponse` → `ActivityItem[]` (lines 119-128)
   - Duplicate date formatting logic
   - No centralized transformation utilities

3. **API layer coupling**: 
   - Components depend on API response shapes
   - Changes to backend types require updates in multiple places

## Solution Approach

Create a centralized mapping layer:

1. **Shared types module**: Define a single source of truth for entry types
2. **Transformation utilities**: Pure functions to convert between shapes
3. **Type-safe mapping**: Ensure transformations preserve type safety

## Implementation Plan

### Step 1: Create Entry Types Module
- Create `src/types/entry.ts` or `src/lib/entry-types.ts`
- Define `Entry` (backend shape) and `ActivityItem` (frontend shape)
- Export type conversion utilities

### Step 2: Extract Transformation Functions
- Create `entryToActivityItem(entry: Entry): ActivityItem`
- Create `activityItemToEntry(item: ActivityItem): Entry` (if needed)
- Create `youtubeVideoToActivityItem(video: YoutubeVideo): ActivityItem`
- Keep these as pure functions (no side effects)

### Step 3: Update Components
- Update `App.tsx` to use transformation utilities
- Update `ActivityFeed.tsx` to use transformation utilities
- Remove duplicate type definitions

### Step 4: Update API Layer
- `api/entries.ts` can import and re-export `Entry` type
- Keep API layer focused on HTTP concerns

## Benefits

- **Single source of truth**: Entry types defined once
- **Reusable transformations**: Mapping logic is testable and reusable
- **Type safety**: TypeScript ensures correct mappings
- **Easier maintenance**: Changes to types propagate automatically
- **Clear separation**: API layer vs. component layer boundaries

## Risks

- **Low risk**: Pure refactoring, no behavior changes
- **Import paths**: Need to ensure imports resolve correctly
- **Test updates**: May need to update test mocks

## Functional Programming Preference

The solution uses:
- Pure transformation functions (no side effects)
- Immutable data transformations
- Function composition for complex mappings

## Code Quality Principles

- **Clear intention**: Types and transformations are obvious
- **Easy to maintain**: Changes propagate through imports
- **Simple and brief**: Just extract, don't over-engineer

## File Scope

**In-scope:**
- `frontend/src/api/entries.ts` - Update to use shared types
- `frontend/src/components/ActivityFeed.tsx` - Use transformation utilities
- `frontend/src/App.tsx` - Use transformation utilities
- `frontend/src/lib/entry-types.ts` - New file with types and transformations

**Out-of-scope:**
- Backend types - Different concern
- Other component types - Focus on entries only
- Date formatting utilities - Can be addressed separately if needed

