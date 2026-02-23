import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { Link } from "react-router-dom";
import { Check, Plus, X } from "lucide-react";

import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Button } from "@/components/ui/button";
import { filterActivityItems } from "@/lib/activity-search";
import { extractTagsFromText, formatTagLabel } from "@/lib/activity-tags";
import {
  buildEntryReferenceTitleMap,
  extractEntryReferenceIds,
  extractEntryReferenceTokens,
  resolveEntryReferenceLabel,
} from "@/lib/entry-references";
import { findMentionStateAtCursor } from "@/lib/mention-search";
import {
  compareActivityItemsByPinnedDate,
  type ActivityItem,
} from "@/lib/types/entries";
import {
  parseTodayChecklistMarkdown,
  type TodayChecklistRow,
} from "@/lib/today-entry";
import { cn } from "@/lib/utils";

interface TodayChecklistEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  isEditable?: boolean;
  moveCompletedTasksToEnd?: boolean;
  mentionableItems?: ActivityItem[];
  className?: string;
}

interface TodayChecklistEditorRow {
  id: number;
  text: string;
  checked: boolean;
  entryReferenceIds: string[];
}

interface TodayChecklistMentionState {
  rowId: number;
  query: string;
  startIndex: number;
  endIndex: number;
}

export function TodayChecklistEditor({
  value,
  onChange,
  isEditable = true,
  moveCompletedTasksToEnd = true,
  mentionableItems = [],
  className,
}: TodayChecklistEditorProps) {
  const rowsFromValue = useMemo(() => {
    try {
      return normalizeRowsFromValue(parseTodayChecklistMarkdown(value));
    } catch {
      return normalizeRowsFromValue([]);
    }
  }, [value]);
  const nextRowIdRef = useRef(0);
  const [rows, setRows] = useState<TodayChecklistEditorRow[]>(() =>
    attachRowIds(rowsFromValue, nextRowIdRef),
  );
  const [isInteracting, setIsInteracting] = useState(false);
  const [activeRowId, setActiveRowId] = useState<number | null>(null);
  const [pendingDeleteRowId, setPendingDeleteRowId] = useState<number | null>(null);
  const [mentionState, setMentionState] = useState<TodayChecklistMentionState | null>(
    null,
  );
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const pendingFocusIndexRef = useRef<number | null>(null);
  const pendingSelectionRef = useRef<{
    index: number;
    cursorPosition: number;
  } | null>(null);
  const pendingSerializedRef = useRef<string | null>(null);
  const onChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionableJournalItems = useMemo(
    () =>
      mentionableItems
        .filter((item) => item.category === "journal" && !item.archived)
        .slice()
        .sort(compareActivityItemsByPinnedDate),
    [mentionableItems],
  );
  const entryReferenceTitles = useMemo(
    () =>
      buildEntryReferenceTitleMap(
        mentionableJournalItems.map((item) => ({ id: item.id, title: item.title })),
      ),
    [mentionableJournalItems],
  );
  const mentionSuggestions = useMemo(() => {
    if (!mentionState) {
      return [];
    }

    const query = mentionState.query.trim();
    if (query.length === 0) {
      return mentionableJournalItems.slice(0, 3);
    }

    return filterActivityItems(mentionableJournalItems, query).slice(0, 3);
  }, [mentionState, mentionableJournalItems]);

  const clearMentionState = useCallback(() => {
    setMentionState(null);
    setMentionActiveIndex(0);
  }, []);

  useEffect(() => {
    const pendingFocusIndex = pendingFocusIndexRef.current;
    if (pendingFocusIndex !== null) {
      pendingFocusIndexRef.current = null;
      requestAnimationFrame(() => {
        inputRefs.current[pendingFocusIndex]?.focus();
      });
    }

    const pendingSelection = pendingSelectionRef.current;
    if (!pendingSelection) {
      return;
    }
    pendingSelectionRef.current = null;
    requestAnimationFrame(() => {
      const input = inputRefs.current[pendingSelection.index];
      if (!input) {
        return;
      }
      input.focus();
      input.setSelectionRange(
        pendingSelection.cursorPosition,
        pendingSelection.cursorPosition,
      );
    });
  }, [rows]);

  useEffect(() => {
    if (isInteracting) {
      return;
    }
    const nextSerialized = serializeRowsForStorage(rowsFromValue);
    const currentSerialized = serializeRowsForStorage(stripEditorRows(rows));
    if (nextSerialized !== currentSerialized) {
      setRows(attachRowIds(rowsFromValue, nextRowIdRef));
    }
  }, [isInteracting, rows, rowsFromValue]);

  useEffect(() => {
    if (!mentionState) {
      return;
    }
    if (rows.some((row) => row.id === mentionState.rowId)) {
      return;
    }
    clearMentionState();
  }, [clearMentionState, mentionState, rows]);

  useEffect(() => {
    if (!mentionState || mentionSuggestions.length === 0) {
      setMentionActiveIndex(0);
      return;
    }
    setMentionActiveIndex((current) =>
      Math.min(current, mentionSuggestions.length - 1),
    );
  }, [mentionState, mentionSuggestions.length]);

  const flushPendingChange = useCallback(() => {
    const pendingSerialized = pendingSerializedRef.current;
    if (pendingSerialized === null) {
      return;
    }
    pendingSerializedRef.current = null;
    onChange(pendingSerialized);
  }, [onChange]);

  const scheduleChange = useCallback(
    (nextSerialized: string, immediate = false) => {
      pendingSerializedRef.current = nextSerialized;

      if (onChangeDebounceRef.current) {
        clearTimeout(onChangeDebounceRef.current);
        onChangeDebounceRef.current = null;
      }

      if (immediate) {
        flushPendingChange();
        return;
      }

      onChangeDebounceRef.current = setTimeout(() => {
        onChangeDebounceRef.current = null;
        flushPendingChange();
      }, 120);
    },
    [flushPendingChange],
  );

  const commitRows = useCallback(
    (nextRows: TodayChecklistEditorRow[], immediate = false) => {
      const normalized = normalizeEditorRowsForCommit(nextRows, nextRowIdRef);
      setRows(normalized);
      scheduleChange(serializeRowsForStorage(stripEditorRows(normalized)), immediate);
    },
    [scheduleChange],
  );

  const updateMentionStateForRow = useCallback(
    (rowId: number, text: string, cursorPosition: number | null) => {
      if (!isEditable) {
        clearMentionState();
        return;
      }

      const candidate = findMentionStateAtCursor(text, cursorPosition);
      if (!candidate) {
        clearMentionState();
        return;
      }

      const isSameQuery =
        mentionState?.rowId === rowId && mentionState.query === candidate.query;
      setMentionState({
        rowId,
        query: candidate.query,
        startIndex: candidate.startIndex,
        endIndex: candidate.endIndex,
      });
      if (!isSameQuery) {
        setMentionActiveIndex(0);
      }
    },
    [clearMentionState, isEditable, mentionState],
  );

  const handleTextChange = useCallback(
    (index: number, event: ChangeEvent<HTMLTextAreaElement>) => {
      const row = rows[index];
      if (!row) {
        return;
      }
      const nextRows = rows.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              text: event.target.value,
            }
          : row,
      );
      commitRows(nextRows);
      updateMentionStateForRow(
        row.id,
        event.target.value,
        event.target.selectionStart,
      );
    },
    [commitRows, rows, updateMentionStateForRow],
  );

  const handleTextSelect = useCallback(
    (index: number, event: SyntheticEvent<HTMLTextAreaElement>) => {
      const row = rows[index];
      if (!row) {
        return;
      }
      updateMentionStateForRow(
        row.id,
        row.text,
        event.currentTarget.selectionStart,
      );
    },
    [rows, updateMentionStateForRow],
  );

  const insertMention = useCallback(
    (index: number, item: ActivityItem) => {
      const row = rows[index];
      if (!row || !mentionState || mentionState.rowId !== row.id) {
        return;
      }

      const nextText = `${row.text.slice(0, mentionState.startIndex)}${row.text.slice(mentionState.endIndex)}`;
      const nextReferenceIds = row.entryReferenceIds.includes(item.id)
        ? row.entryReferenceIds
        : [...row.entryReferenceIds, item.id];
      const nextCursorPosition = mentionState.startIndex;
      const nextRows = rows.map((currentRow, rowIndex) =>
        rowIndex === index
          ? {
              ...currentRow,
              text: nextText,
              entryReferenceIds: nextReferenceIds,
            }
          : currentRow,
      );

      pendingSelectionRef.current = {
        index,
        cursorPosition: nextCursorPosition,
      };
      commitRows(nextRows, true);
      clearMentionState();
    },
    [clearMentionState, commitRows, mentionState, rows],
  );

  const handleCheckedChange = useCallback(
    (index: number, checked: boolean) => {
      const toggledRows = rows.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              checked,
            }
          : row,
      );
      const shouldMoveCompletedTask =
        moveCompletedTasksToEnd && checked && !rows[index]?.checked;
      const nextRows = shouldMoveCompletedTask
        ? moveRowToEndBeforeTrailingEmptyRows(toggledRows, index)
        : toggledRows;
      commitRows(nextRows, true);
    },
    [commitRows, moveCompletedTasksToEnd, rows],
  );

  const insertRowAfter = useCallback(
    (index: number) => {
      const nextRows = [...rows];
      const insertIndex = Math.max(0, Math.min(index + 1, nextRows.length));
      nextRows.splice(insertIndex, 0, createEditorRow(nextRowIdRef));
      pendingFocusIndexRef.current = insertIndex;
      commitRows(nextRows, true);
    },
    [commitRows, rows],
  );

  const addTaskRow = useCallback(() => {
    const index = rows.length === 0 ? 0 : rows.length - 1;
    insertRowAfter(index);
  }, [insertRowAfter, rows.length]);

  const handleKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => {
      const row = rows[index];
      if (!row) {
        return;
      }

      const hasActiveMention =
        mentionState?.rowId === row.id && mentionSuggestions.length > 0;

      if (hasActiveMention && event.key === "ArrowDown") {
        event.preventDefault();
        setMentionActiveIndex(
          (current) => (current + 1) % mentionSuggestions.length,
        );
        return;
      }

      if (hasActiveMention && event.key === "ArrowUp") {
        event.preventDefault();
        setMentionActiveIndex(
          (current) =>
            (current - 1 + mentionSuggestions.length) % mentionSuggestions.length,
        );
        return;
      }

      if (hasActiveMention && event.key === "Enter") {
        event.preventDefault();
        const selection =
          mentionSuggestions[mentionActiveIndex] ?? mentionSuggestions[0];
        if (selection) {
          insertMention(index, selection);
        }
        return;
      }

      if (mentionState?.rowId === row.id && event.key === "Escape") {
        event.preventDefault();
        clearMentionState();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        insertRowAfter(index);
        return;
      }

      if (
        event.key === "Backspace" &&
        row.text.trim().length === 0 &&
        rows.length > 1
      ) {
        event.preventDefault();
        const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
        const nextFocusIndex = Math.max(0, index - 1);
        commitRows(nextRows, true);
        requestAnimationFrame(() => {
          inputRefs.current[nextFocusIndex]?.focus();
        });
      }
    },
    [
      clearMentionState,
      commitRows,
      insertMention,
      insertRowAfter,
      mentionActiveIndex,
      mentionState,
      mentionSuggestions,
      rows,
    ],
  );

  const handleFieldFocus = useCallback(() => {
    setIsInteracting(true);
  }, []);

  const handleRowFocus = useCallback((rowId: number) => {
    setActiveRowId(rowId);
  }, []);

  const handleRowBlur = useCallback((rowId: number) => {
    setActiveRowId((current) => (current === rowId ? null : current));
    setPendingDeleteRowId((current) => (current === rowId ? null : current));
  }, []);

  const handleDeleteClick = useCallback(
    (rowId: number) => {
      if (pendingDeleteRowId !== rowId) {
        setActiveRowId(rowId);
        setPendingDeleteRowId(rowId);
        return;
      }

      const nextRows = rows.filter((row) => row.id !== rowId);
      commitRows(nextRows, true);
      setPendingDeleteRowId(null);
      setActiveRowId(null);
    },
    [commitRows, pendingDeleteRowId, rows],
  );

  const handleFieldBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (!containerRef.current || !activeElement) {
        setIsInteracting(false);
        return;
      }
      if (!containerRef.current.contains(activeElement)) {
        flushPendingChange();
        setIsInteracting(false);
        clearMentionState();
      }
    });
  }, [clearMentionState, flushPendingChange]);

  useEffect(
    () => () => {
      if (onChangeDebounceRef.current) {
        clearTimeout(onChangeDebounceRef.current);
      }
      flushPendingChange();
    },
    [flushPendingChange],
  );

  return (
    <div ref={containerRef} className={cn("space-y-1.5", className)}>
      {rows.map((row, index) => (
        <TodayChecklistRowEditor
          key={row.id}
          row={row}
          rowId={row.id}
          index={index}
          totalRows={rows.length}
          isEditable={isEditable}
          onCheckedChange={handleCheckedChange}
          onTextChange={handleTextChange}
          onTextSelect={handleTextSelect}
          onKeyDown={handleKeyDown}
          onFieldFocus={handleFieldFocus}
          onFieldBlur={handleFieldBlur}
          isFocused={activeRowId === row.id}
          isPendingDelete={pendingDeleteRowId === row.id}
          onRowFocus={handleRowFocus}
          onRowBlur={handleRowBlur}
          onDeleteClick={handleDeleteClick}
          mentionQuery={mentionState?.rowId === row.id ? mentionState.query : null}
          mentionSuggestions={
            mentionState?.rowId === row.id ? mentionSuggestions : []
          }
          mentionActiveIndex={mentionActiveIndex}
          onMentionSelect={(item) => {
            insertMention(index, item);
          }}
          entryReferenceTitles={entryReferenceTitles}
          setInputRef={(element) => {
            inputRefs.current[index] = element;
          }}
        />
      ))}
      {isEditable ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addTaskRow}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Add task row"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add task
        </Button>
      ) : null}
    </div>
  );
}

interface TodayChecklistRowEditorProps {
  row: TodayChecklistEditorRow;
  rowId: number;
  index: number;
  totalRows: number;
  isEditable: boolean;
  onCheckedChange: (index: number, checked: boolean) => void;
  onTextChange: (index: number, event: ChangeEvent<HTMLTextAreaElement>) => void;
  onTextSelect: (index: number, event: SyntheticEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFieldFocus: () => void;
  onFieldBlur: () => void;
  isFocused: boolean;
  isPendingDelete: boolean;
  onRowFocus: (rowId: number) => void;
  onRowBlur: (rowId: number) => void;
  onDeleteClick: (rowId: number) => void;
  mentionQuery: string | null;
  mentionSuggestions: ActivityItem[];
  mentionActiveIndex: number;
  onMentionSelect: (item: ActivityItem) => void;
  entryReferenceTitles: Record<string, string>;
  setInputRef: (element: HTMLTextAreaElement | null) => void;
}

function TodayChecklistRowEditor({
  row,
  rowId,
  index,
  totalRows,
  isEditable,
  onCheckedChange,
  onTextChange,
  onTextSelect,
  onKeyDown,
  onFieldFocus,
  onFieldBlur,
  isFocused,
  isPendingDelete,
  onRowFocus,
  onRowBlur,
  onDeleteClick,
  mentionQuery,
  mentionSuggestions,
  mentionActiveIndex,
  onMentionSelect,
  entryReferenceTitles,
  setInputRef,
}: TodayChecklistRowEditorProps) {
  const tags = extractTagsFromText(row.text);
  const entryReferenceIds = row.entryReferenceIds;
  const rowRef = useRef<HTMLDivElement | null>(null);

  const handleRowBlurCapture = useCallback(() => {
    requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (!rowRef.current || !activeElement) {
        onRowBlur(rowId);
        return;
      }
      if (!rowRef.current.contains(activeElement)) {
        onRowBlur(rowId);
      }
    });
  }, [onRowBlur, rowId]);

  return (
    <div
      ref={rowRef}
      className="flex items-start gap-2 rounded-md border border-border/50 bg-background/60 px-3 py-2"
      onFocusCapture={() => {
        onRowFocus(rowId);
      }}
      onBlurCapture={handleRowBlurCapture}
    >
      <input
        type="checkbox"
        checked={row.checked}
        disabled={!isEditable}
        className="mt-1 h-4 w-4 accent-primary"
        onChange={(event) => {
          onCheckedChange(index, event.target.checked);
        }}
        onFocus={onFieldFocus}
        onBlur={onFieldBlur}
        aria-label={`Toggle task ${index + 1}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <AutoResizeTextarea
          ref={setInputRef}
          value={row.text}
          onChange={(event) => {
            onTextChange(index, event);
          }}
          onSelect={(event) => {
            onTextSelect(index, event);
          }}
          onKeyDown={(event) => {
            onKeyDown(index, event);
          }}
          onFocus={onFieldFocus}
          onBlur={onFieldBlur}
          readOnly={!isEditable}
          placeholder={index === totalRows - 1 ? "Type a task…" : ""}
          minRows={1}
          className="min-h-0 resize-none overflow-hidden border-0 bg-transparent px-1 py-0 text-sm leading-6 shadow-none focus-visible:ring-0"
        />
        {tags.length > 0 || entryReferenceIds.length > 0 ? (
          <div className="flex flex-wrap gap-1 px-1 pb-0.5">
            {tags.map((tag) => (
              <span
                key={`${index}-${tag}`}
                className={cn(
                  "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
                  tag === "archived" && "bg-primary/15 text-primary",
                )}
              >
                {formatTagLabel(tag)}
              </span>
            ))}
            {entryReferenceIds.map((entryId) => (
              <Link
                key={`${index}-entry-reference-${entryId}`}
                to={`/journals/${entryId}`}
                className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                title={`@entry:${entryId}`}
              >
                {resolveEntryReferenceLabel(entryId, entryReferenceTitles)}
              </Link>
            ))}
          </div>
        ) : null}
        {isEditable && mentionQuery !== null ? (
          <div
            className="rounded-md border border-border bg-popover p-1 shadow-sm"
            role="listbox"
          >
            {mentionSuggestions.length > 0 ? (
              <div className="flex flex-col gap-1">
                {mentionSuggestions.map((item, suggestionIndex) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center rounded-md px-2 py-1 text-left text-sm",
                      suggestionIndex === mentionActiveIndex
                        ? "bg-primary/10 text-foreground"
                        : "text-foreground/90 hover:bg-muted/60",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      onMentionSelect(item);
                    }}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                {mentionQuery.trim().length === 0
                  ? "No recent journal entries"
                  : "No matches"}
              </p>
            )}
          </div>
        ) : null}
      </div>
      {isEditable && isFocused ? (
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            onDeleteClick(rowId);
          }}
          onFocus={onFieldFocus}
          onBlur={onFieldBlur}
          className={cn(
            "mt-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:text-foreground/80 dark:hover:text-foreground",
            isPendingDelete &&
              "text-destructive hover:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20",
          )}
          aria-label={
            isPendingDelete
              ? `Confirm delete task ${index + 1}`
              : `Delete task ${index + 1}`
          }
        >
          {isPendingDelete ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}
    </div>
  );
}

function createEditorRow(idRef: { current: number }): TodayChecklistEditorRow {
  const rowId = idRef.current;
  idRef.current += 1;
  return { id: rowId, text: "", checked: false, entryReferenceIds: [] };
}

function attachRowIds(
  rows: TodayChecklistRow[],
  idRef: { current: number },
): TodayChecklistEditorRow[] {
  return rows.map((row) => {
    const normalized = splitTaskTextAndReferences(row.text);
    return {
      id: idRef.current++,
      text: normalized.text,
      checked: row.checked,
      entryReferenceIds: normalized.entryReferenceIds,
    };
  });
}

function stripEditorRows(rows: TodayChecklistEditorRow[]): TodayChecklistRow[] {
  return rows.map(({ text, checked, entryReferenceIds }) => ({
    text: composeTaskStorageText(text, entryReferenceIds),
    checked,
  }));
}

function normalizeEditorRowsForCommit(
  rows: TodayChecklistEditorRow[],
  idRef: { current: number },
): TodayChecklistEditorRow[] {
  if (rows.length === 0) {
    return [createEditorRow(idRef)];
  }

  return rows.map((row) => {
    const normalizedText = normalizeTaskRowText(row.text);
    const typedReferenceIds = extractEntryReferenceIds(normalizedText);
    const strippedText = stripEntryReferenceTokensFromText(normalizedText);
    const mergedReferenceIds = dedupeReferenceIds([
      ...row.entryReferenceIds,
      ...typedReferenceIds,
    ]);
    const hasContent =
      strippedText.trim().length > 0 || mergedReferenceIds.length > 0;

    return {
      id: row.id,
      text: strippedText,
      checked: row.checked && hasContent,
      entryReferenceIds: mergedReferenceIds,
    };
  });
}

function normalizeTodayRowsForCommit(rows: TodayChecklistRow[]): TodayChecklistRow[] {
  if (rows.length === 0) {
    return [{ text: "", checked: false }];
  }

  return rows.map((row) => {
    const normalizedText = normalizeTaskRowText(row.text);
    return {
      text: normalizedText,
      checked: row.checked && normalizedText.trim().length > 0,
    };
  });
}

function moveRowToEndBeforeTrailingEmptyRows<
  TRow extends { text: string; entryReferenceIds?: string[] },
>(
  rows: TRow[],
  index: number,
): TRow[] {
  if (index < 0 || index >= rows.length) {
    return rows;
  }

  const rowToMove = rows[index];
  const hasText = rowToMove.text.trim().length > 0;
  const hasReferences = (rowToMove.entryReferenceIds ?? []).length > 0;
  if (!hasText && !hasReferences) {
    return rows;
  }

  const rowsWithoutMovedRow = rows.filter((_, rowIndex) => rowIndex !== index);
  const insertIndex =
    findIndexBeforeTrailingEmptyRows(rowsWithoutMovedRow);

  return [
    ...rowsWithoutMovedRow.slice(0, insertIndex),
    rowToMove,
    ...rowsWithoutMovedRow.slice(insertIndex),
  ];
}

function findIndexBeforeTrailingEmptyRows<
  TRow extends { text: string; entryReferenceIds?: string[] },
>(rows: TRow[]): number {
  let insertIndex = rows.length;

  while (
    insertIndex > 0 &&
    rows[insertIndex - 1].text.trim().length === 0 &&
    (rows[insertIndex - 1].entryReferenceIds ?? []).length === 0
  ) {
    insertIndex -= 1;
  }

  return insertIndex;
}

function normalizeRowsFromValue(rows: TodayChecklistRow[]): TodayChecklistRow[] {
  const normalizedRows = normalizeTodayRowsForCommit(rows);

  let lastNonEmptyIndex = normalizedRows.length - 1;
  while (
    lastNonEmptyIndex >= 0 &&
    normalizedRows[lastNonEmptyIndex].text.trim().length === 0
  ) {
    lastNonEmptyIndex -= 1;
  }

  if (lastNonEmptyIndex < 0) {
    return [{ text: "", checked: false }];
  }

  return normalizedRows.slice(0, lastNonEmptyIndex + 1);
}

function serializeRowsForStorage(rows: TodayChecklistRow[]): string {
  if (rows.length === 0) {
    return "- [ ]";
  }

  return rows
    .map((row) => {
      const normalizedText = row.text.trim();
      if (normalizedText.length === 0) {
        return "- [ ]";
      }
      return `- [${row.checked ? "x" : " "}] ${normalizedText}`;
    })
    .join("\n");
}

function normalizeTaskRowText(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ");
}

function splitTaskTextAndReferences(text: string): {
  text: string;
  entryReferenceIds: string[];
} {
  const entryReferenceIds = extractEntryReferenceIds(text);
  if (entryReferenceIds.length === 0) {
    return { text, entryReferenceIds: [] };
  }

  return {
    text: stripEntryReferenceTokensFromText(text),
    entryReferenceIds,
  };
}

function stripEntryReferenceTokensFromText(text: string): string {
  const tokens = extractEntryReferenceTokens(text);
  if (tokens.length === 0) {
    return text;
  }

  let cursor = 0;
  let stripped = "";

  tokens.forEach((token) => {
    stripped += text.slice(cursor, token.start);
    cursor = token.end;
  });

  stripped += text.slice(cursor);
  return stripped.replace(/\s+/g, " ").trim();
}

function composeTaskStorageText(text: string, entryReferenceIds: string[]): string {
  const trimmedText = text.trim();
  const tokens = dedupeReferenceIds(entryReferenceIds).map(
    (entryId) => `@entry:${entryId}`,
  );

  if (trimmedText.length === 0) {
    return tokens.join(" ");
  }
  if (tokens.length === 0) {
    return trimmedText;
  }

  return `${trimmedText} ${tokens.join(" ")}`;
}

function dedupeReferenceIds(entryReferenceIds: string[]): string[] {
  return [...new Set(entryReferenceIds)];
}
