# Refactor Plan: ActivityFeed State Consolidation

**Status**: 🔍 **PLANNED** - Ready for implementation

## Problem Statement

The `ActivityFeed` component handles too many responsibilities and uses multiple `useState` hooks:

1. **Multiple useState hooks**: The component manages 8 separate state variables:
   - `channelInput` - YouTube channel input
   - `isLoadingVideos` - Loading state for YouTube fetch
   - `youtubeError` - Error state for YouTube operations
   - `youtubeFeed` - Cached YouTube feed data
   - `editingEntryId` - Currently editing entry ID
   - `editingDraft` - Draft state for editing
   - `editingError` - Error state for editing operations
   - `deletingEntryId` - Entry being deleted

2. **Mixed responsibilities**: The component handles:
   - Displaying activity items
   - Editing entries
   - Deleting entries
   - Fetching YouTube videos
   - Managing YouTube feed state

3. **State coordination complexity**: Related state (like `editingEntryId` and `editingDraft`) must be kept in sync manually.

4. **Large component**: The component is 680 lines, making it hard to understand and maintain.

## Solution Approach

Extract state management into custom hooks:

1. **YouTube state hook**: Extract YouTube-related state (`channelInput`, `isLoadingVideos`, `youtubeError`, `youtubeFeed`) into `useYouTubeFeed`
2. **Entry editing hook**: Extract editing-related state (`editingEntryId`, `editingDraft`, `editingError`) into `useEntryEditing`
3. **Deletion state**: Simple state that can stay inline or be extracted if needed

## Implementation Plan

### Step 1: Create useYouTubeFeed Hook

Create `frontend/src/hooks/useYouTubeFeed.ts`:

```typescript
import { useState, useCallback } from "react";
import { isAxiosError } from "axios";

import { youtubeApi, type YoutubeFeedResponse } from "@/api/youtube";

/**
 * Hook for managing YouTube channel feed state and operations.
 * 
 * Encapsulates the state and logic for fetching and displaying YouTube videos.
 */
export function useYouTubeFeed() {
  const [channelInput, setChannelInput] = useState("");
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeFeed, setYoutubeFeed] = useState<YoutubeFeedResponse | null>(
    null,
  );

  const handleFetchVideos = useCallback(async () => {
    const trimmed = channelInput.trim();
    if (!trimmed) {
      setYoutubeError("Enter a YouTube channel handle, link, or ID.");
      return;
    }

    setIsLoadingVideos(true);
    setYoutubeError(null);

    try {
      const feed = await youtubeApi.fetchChannelVideos(trimmed);
      setYoutubeFeed(feed);
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data as unknown;
        const detail =
          typeof data === "object" &&
          data !== null &&
          "detail" in data &&
          typeof (data as { detail: unknown }).detail === "string"
            ? (data as { detail: string }).detail
            : null;
        if (status === 404) {
          setYoutubeError(
            detail ?? "We couldn't find that channel on YouTube.",
          );
        } else if (status === 503) {
          setYoutubeError(
            detail ?? "The server hasn't been configured for YouTube yet.",
          );
        } else {
          setYoutubeError(detail ?? "We couldn't load videos from YouTube.");
        }
      } else {
        setYoutubeError("We couldn't load videos from YouTube.");
      }
    } finally {
      setIsLoadingVideos(false);
    }
  }, [channelInput]);

  const handleChannelKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleFetchVideos();
      }
    },
    [handleFetchVideos],
  );

  return {
    channelInput,
    setChannelInput,
    isLoadingVideos,
    youtubeError,
    youtubeFeed,
    handleFetchVideos,
    handleChannelKeyDown,
  };
}
```

**Rationale**:
- Encapsulates related state and logic
- Pure function (no side effects beyond state updates)
- Reusable if needed elsewhere
- Easier to test

### Step 2: Create useEntryEditing Hook

Create `frontend/src/hooks/useEntryEditing.ts`:

```typescript
import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { entriesMutations, type UpdateEntryInput } from "@/api/entries";
import { type ActivityDraft } from "@/components/ActivityFeed";
import { type ActivityItem } from "@/lib/types/entries";

/**
 * Hook for managing entry editing state and operations.
 * 
 * Encapsulates the state and logic for editing and deleting entries.
 */
export function useEntryEditing() {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<ActivityDraft | null>(null);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  
  const updateEntryMutation = useMutation(
    entriesMutations.update(queryClient, {
      onError: (error) => {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't update this entry. Please try again.";
        setEditingError(message);
      },
      onSuccess: () => {
        setEditingEntryId(null);
        setEditingDraft(null);
        setEditingError(null);
      },
    }),
  );

  const deleteEntryMutation = useMutation(
    entriesMutations.delete(queryClient, {
      onError: (error) => {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't delete this entry. Please try again.";
        setEditingError(message);
      },
      onSuccess: (_data, id) => {
        if (editingEntryId === id) {
          setEditingEntryId(null);
          setEditingDraft(null);
        }
      },
      onSettled: () => {
        setDeletingEntryId(null);
      },
    }),
  );

  const startEdit = useCallback((item: ActivityItem) => {
    if (item.category === "video" || item.id.startsWith("youtube:")) {
      return;
    }
    setEditingEntryId(item.id);
    setEditingDraft({
      title: item.title,
      summary: item.summary,
      date: toDateTimeLocalInput(item.date),
      videoId: item.videoId ?? "",
    });
    setEditingError(null);
  }, []);

  const handleEditDraftChange = useCallback((draft: ActivityDraft) => {
    setEditingDraft(draft);
    setEditingError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingEntryId(null);
    setEditingDraft(null);
    setEditingError(null);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingEntryId || !editingDraft) {
      return;
    }
    const trimmedTitle = editingDraft.title.trim();
    const trimmedSummary = editingDraft.summary.trim();
    if (trimmedTitle.length === 0 || trimmedSummary.length === 0) {
      setEditingError("Add a title and entry before saving.");
      return;
    }

    const trimmedVideoId = editingDraft.videoId.trim();
    const payload: UpdateEntryInput = {
      id: editingEntryId,
      title: trimmedTitle,
      summary: trimmedSummary,
      date: new Date(editingDraft.date).toISOString(),
      videoId: trimmedVideoId.length > 0 ? trimmedVideoId : null,
    };

    try {
      setEditingError(null);
      await updateEntryMutation.mutateAsync(payload);
    } catch (error: unknown) {
      // handled in the mutation onError callback
    }
  }, [editingDraft, editingEntryId, updateEntryMutation]);

  const deleteEntry = useCallback(
    (id: string) => {
      if (deletingEntryId) {
        return;
      }
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "Are you sure you want to delete this entry?",
        );
        if (!confirmed) {
          return;
        }
      }
      setDeletingEntryId(id);
      setEditingError(null);
      void deleteEntryMutation.mutateAsync(id).catch(() => {
        // handled in the mutation onError callback
      });
    },
    [deleteEntryMutation, deletingEntryId],
  );

  return {
    editingEntryId,
    editingDraft,
    editingError,
    deletingEntryId,
    isUpdating: updateEntryMutation.isPending,
    isDeleting: (id: string) => deletingEntryId === id && deleteEntryMutation.isPending,
    startEdit,
    handleEditDraftChange,
    cancelEdit,
    submitEdit,
    deleteEntry,
  };
}

function toDateTimeLocalInput(date: string) {
  const original = new Date(date);
  original.setSeconds(0);
  original.setMilliseconds(0);
  const offset = original.getTimezoneOffset();
  const adjusted = new Date(original.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 16);
}
```

**Rationale**:
- Encapsulates editing state and operations
- Keeps related state together
- Easier to test in isolation
- Clear separation of concerns

### Step 3: Refactor ActivityFeed Component

**Before:**
```typescript
export function ActivityFeed({ ... }: ActivityFeedProps) {
  const [channelInput, setChannelInput] = useState("");
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeFeed, setYoutubeFeed] = useState<YoutubeFeedResponse | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<ActivityDraft | null>(null);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  
  // ... 200+ lines of handler functions ...
}
```

**After:**
```typescript
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { useEntryEditing } from "@/hooks/useEntryEditing";

export function ActivityFeed({ ... }: ActivityFeedProps) {
  const youtubeState = useYouTubeFeed();
  const editingState = useEntryEditing();
  
  // Component focuses on rendering and composition
  // State management delegated to hooks
}
```

**Rationale**:
- Significant reduction in component complexity
- Clear separation of concerns
- Easier to understand and maintain
- Hooks can be reused or tested independently

### Step 4: Create hooks directory

Create `frontend/src/hooks/` directory and add `index.ts`:

```typescript
export { useYouTubeFeed } from "./useYouTubeFeed";
export { useEntryEditing } from "./useEntryEditing";
```

### Step 5: Update Tests

- Component tests should continue to work
- Create unit tests for hooks if desired
- Run: `make test-frontend`

## Code Example: Complete Refactored Structure

```typescript
// frontend/src/hooks/useYouTubeFeed.ts
export function useYouTubeFeed() {
  // ... YouTube state management ...
  return { channelInput, setChannelInput, ... };
}

// frontend/src/hooks/useEntryEditing.ts
export function useEntryEditing() {
  // ... Editing state management ...
  return { editingEntryId, editingDraft, startEdit, ... };
}

// frontend/src/components/ActivityFeed.tsx
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { useEntryEditing } from "@/hooks/useEntryEditing";

export function ActivityFeed({ ... }: ActivityFeedProps) {
  const youtubeState = useYouTubeFeed();
  const editingState = useEntryEditing();
  
  // ... component logic ...
}
```

## Verification Checklist

- [ ] `useYouTubeFeed` hook created and tested
- [ ] `useEntryEditing` hook created and tested
- [ ] `ActivityFeed` refactored to use hooks
- [ ] All state management logic extracted
- [ ] Tests pass: `make test-frontend`
- [ ] No behavior changes
- [ ] Component is more readable and maintainable

## Benefits

- **Reduced complexity**: Component focuses on rendering, not state management
- **Better separation**: State logic separated from UI logic
- **Reusability**: Hooks can be reused in other components
- **Testability**: Hooks can be tested independently
- **Easier maintenance**: Changes to state logic isolated to hooks

## Risks

- **Low risk**: Pure refactoring with no behavior changes
- **Test coverage**: Existing tests will catch any regressions
- **Learning curve**: Team needs to understand custom hooks pattern

## Functional Programming Preference

The solution uses:
- Pure functions (hooks return consistent values)
- Immutable state updates (React's useState)
- Function composition (hooks compose together)

## Code Quality Principles

- **Clear intention**: State management is obvious and separated
- **Easy to maintain**: Changes isolated to hook files
- **Simple and brief**: Just extract, don't over-engineer

## File Scope

**In-scope:**
- `frontend/src/hooks/useYouTubeFeed.ts` - New hook for YouTube state
- `frontend/src/hooks/useEntryEditing.ts` - New hook for editing state
- `frontend/src/hooks/index.ts` - Barrel export
- `frontend/src/components/ActivityFeed.tsx` - Refactor to use hooks

**Out-of-scope:**
- Draft creation state (handled by parent component)
- Entry display logic (stays in component)
- Other component refactoring (focus on state only)

## Alternative Approach: useReducer

If the state becomes more complex, consider using `useReducer`:

```typescript
type EditingState = {
  editingEntryId: string | null;
  editingDraft: ActivityDraft | null;
  editingError: string | null;
  deletingEntryId: string | null;
};

type EditingAction = 
  | { type: "start_edit"; item: ActivityItem }
  | { type: "update_draft"; draft: ActivityDraft }
  | { type: "cancel_edit" }
  | { type: "set_error"; error: string | null }
  | { type: "set_deleting"; id: string | null };

function editingReducer(state: EditingState, action: EditingAction): EditingState {
  // ... reducer logic ...
}
```

However, for this use case, `useState` with custom hooks is simpler and sufficient.

