# Refactor Plan: Extract Components from App.tsx

## Overview

Extract `HealthBadge` and `ScorePlaceholder` components from `App.tsx` into separate files to improve code organization and component reusability.

## Current State

**File:** `frontend/src/App.tsx`

- **Lines:** 296
- **Components:** 3
  - `HealthBadge` (~37 lines)
  - `ScorePlaceholder` (~25 lines)
  - `DashboardShell` (~182 lines)
  - `App` (root component, ~6 lines)

## Problem Statement

While not as critical as ActivityFeed.tsx, having multiple components in App.tsx:

- Makes the file harder to navigate
- Reduces component reusability
- Mixes concerns (layout, health status, placeholder UI)
- Makes it harder to test components independently

## Goal

Extract `HealthBadge` and `ScorePlaceholder` into separate files, leaving `App.tsx` focused on application structure and `DashboardShell` logic.

## Files to Create

### 1. `frontend/src/components/HealthBadge.tsx`

**Purpose:** Display backend health status indicator

**Content:**

- `HealthBadge` component (lines 38-75 from App.tsx)

**Dependencies:**

- `@tanstack/react-query` - useQuery hook
- `@/api/health` - healthQueries
- `@/lib/utils` - cn utility

**Exports:**

- `HealthBadge` component

**Props:**

- `className?: string` - Optional className for styling

### 2. `frontend/src/components/ScorePlaceholder.tsx`

**Purpose:** Placeholder card for analytics visualization

**Content:**

- `ScorePlaceholder` component (lines 77-102 from App.tsx)

**Dependencies:**

- `@/components/ui/card` - Card components
- `@/components/HealthBadge` - HealthBadge component

**Exports:**

- `ScorePlaceholder` component

## Migration Steps

### Step 1: Create HealthBadge.tsx

1. Create `frontend/src/components/HealthBadge.tsx`
2. Copy `HealthBadge` component from App.tsx
3. Add necessary imports
4. Export component

### Step 2: Create ScorePlaceholder.tsx

1. Create `frontend/src/components/ScorePlaceholder.tsx`
2. Copy `ScorePlaceholder` component from App.tsx
3. Import `HealthBadge` from `./HealthBadge`
4. Add necessary imports
5. Export component

### Step 3: Update App.tsx

1. Import `HealthBadge` from `@/components/HealthBadge`
2. Import `ScorePlaceholder` from `@/components/ScorePlaceholder`
3. Remove `HealthBadge` component definition
4. Remove `ScorePlaceholder` component definition
5. Verify imports and usage

### Step 4: Testing

1. Run `make test-frontend`
2. Verify health badge displays correctly
3. Verify score placeholder renders
4. Check dashboard layout

## Expected Outcomes

### Before

```
App.tsx (296 lines)
├── HealthBadge component
├── ScorePlaceholder component
├── DashboardShell component
└── App root component
```

### After

```
App.tsx (~230 lines)
├── DashboardShell component
└── App root component

HealthBadge.tsx (~40 lines)
└── HealthBadge component

ScorePlaceholder.tsx (~30 lines)
└── ScorePlaceholder component
```

## Benefits

1. **Improved Organization**

   - Clearer component boundaries
   - Easier to find specific components

2. **Enhanced Reusability**

   - HealthBadge can be used in other contexts
   - ScorePlaceholder can be reused or replaced easily

3. **Better Testability**

   - Components can be tested independently
   - Easier to mock dependencies

4. **Reduced File Size**
   - App.tsx becomes more focused
   - Easier to navigate

## Risks & Mitigations

### Risk: Over-engineering

**Mitigation:** These are reasonable extractions - components are self-contained and reusable

### Risk: Import Paths

**Mitigation:** Simple relative imports, verify all imports work

## Priority

**Low Priority** - This refactoring is less critical than ActivityFeed extraction. The file is manageable at current size, but extraction would improve organization.

## Success Criteria

- ✅ HealthBadge extracted to separate file
- ✅ ScorePlaceholder extracted to separate file
- ✅ App.tsx reduced to ~230 lines
- ✅ All tests pass
- ✅ Components remain fully functional
- ✅ No breaking changes
