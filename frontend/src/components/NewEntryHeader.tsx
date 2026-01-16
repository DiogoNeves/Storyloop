import type { ChangeEvent, KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";

type NewEntryHeaderProps = {
  title: string;
  onTitleChange: (value: string) => void;
  createError: string | null;
  onClearError: () => void;
  isOnline: boolean;
  isCreating: boolean;
  onCreate: () => void;
};

export function NewEntryHeader({
  title,
  onTitleChange,
  createError,
  onClearError,
  isOnline,
  isCreating,
  onCreate,
}: NewEntryHeaderProps) {
  const canCreate = title.trim().length > 0;
  const isCreateDisabled = isCreating || !isOnline || !canCreate;
  const createDisabledReason = !isOnline ? "Go online to create" : null;

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onTitleChange(event.target.value);
    onClearError();
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    if (isCreateDisabled) {
      return;
    }
    onCreate();
  };

  const createButton = canCreate ? (
    <Button
      type="button"
      onClick={onCreate}
      disabled={isCreateDisabled}
      title={createDisabledReason ?? undefined}
      aria-label={createDisabledReason ?? "Create"}
    >
      {isCreating ? "Creating…" : "Create"}
    </Button>
  ) : null;

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        New journal entry
      </span>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <input
          className="w-full flex-1 border-none bg-transparent text-2xl font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Untitled entry"
          value={title}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
          autoFocus
        />
        {createButton}
      </div>
      {createError ? (
        <p className="text-xs text-destructive">{createError}</p>
      ) : null}
    </div>
  );
}
