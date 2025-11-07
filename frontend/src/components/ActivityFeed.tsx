import { useMemo, useState, useEffect } from "react";

import { type ActivityItem } from "@/lib/types/entries";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActivityFeedItem } from "./ActivityFeedItem";
import { ActivityDraftCard } from "./ActivityDraftCard";
import { YouTubeLinkCard } from "./YouTubeLinkCard";
import { youtubeAuthApi } from "@/api/youtubeAuth";

export type { ActivityItem };

export interface ActivityDraft {
  title: string;
  summary: string;
  date: string; // datetime-local string
  videoId: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  draft?: ActivityDraft | null;
  onStartDraft?: () => void;
  onDraftChange?: (draft: ActivityDraft) => void;
  onCancelDraft?: () => void;
  onSubmitDraft?: () => void;
  isSubmittingDraft?: boolean;
  draftError?: string | null;
  errorMessage?: string | null;
}

export function ActivityFeed({
  items,
  draft,
  onStartDraft,
  onDraftChange,
  onCancelDraft,
  onSubmitDraft,
  isSubmittingDraft,
  draftError,
  errorMessage,
}: ActivityFeedProps) {
  const editingState = useEntryEditing();
  const [isLinked, setIsLinked] = useState<boolean | null>(null);

  // Check linked status on mount and when component updates
  useEffect(() => {
    void checkLinkedStatus();
  }, []);

  const checkLinkedStatus = async () => {
    try {
      const status = await youtubeAuthApi.getYoutubeAuthStatus();
      setIsLinked(status.linked);
    } catch {
      // If check fails, assume not linked
      setIsLinked(false);
    }
  };

  const combinedItems = useMemo(() => {
    return items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [items]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg">Recent activity</CardTitle>
          <CardDescription>
            A combined stream of publishing milestones, insights, and journal
            reflections.
          </CardDescription>
        </div>
        <Button
          type="button"
          onClick={onStartDraft}
          disabled={Boolean(draft)}
          className="self-start sm:ml-auto sm:self-end"
        >
          + entry
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage ? (
          <p className="text-sm text-destructive" role="status">
            {errorMessage}
          </p>
        ) : null}
        {isLinked === false ? (
          <YouTubeLinkCard
            onLinked={() => {
              void checkLinkedStatus();
            }}
          />
        ) : null}
        {draft && onDraftChange ? (
          <ActivityDraftCard
            draft={draft}
            onChange={onDraftChange}
            onCancel={onCancelDraft}
            onSubmit={onSubmitDraft}
            isSubmitting={isSubmittingDraft}
            errorMessage={draftError}
            submitLabel="Create entry"
            category="journal"
            idPrefix="new-entry"
          />
        ) : null}
        {combinedItems.map((item) => {
          const isEditing =
            editingState.editingEntryId === item.id &&
            editingState.editingDraft;
          const isEditable =
            item.category !== "content" && !item.id.startsWith("youtube:");
          if (isEditing && editingState.editingDraft) {
            return (
              <ActivityDraftCard
                key={item.id}
                draft={editingState.editingDraft}
                onChange={editingState.handleEditDraftChange}
                onCancel={editingState.cancelEdit}
                onSubmit={() => {
                  void editingState.submitEdit();
                }}
                isSubmitting={editingState.isUpdating}
                errorMessage={editingState.editingError}
                submitLabel="Save changes"
                category={item.category}
                idPrefix={`edit-entry-${item.id}`}
                onDelete={
                  isEditable
                    ? () => {
                        void editingState.deleteEntry(item.id);
                      }
                    : undefined
                }
                isDeleting={editingState.isDeleting(item.id)}
              />
            );
          }

          return (
            <ActivityFeedItem
              key={item.id}
              item={item}
              onEdit={
                isEditable
                  ? () => {
                      editingState.startEdit(item);
                    }
                  : undefined
              }
              onDelete={
                isEditable
                  ? () => {
                      void editingState.deleteEntry(item.id);
                    }
                  : undefined
              }
              isDeleting={editingState.isDeleting(item.id)}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
