import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Check, Plus, X } from "lucide-react";

import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Button } from "@/components/ui/button";
import { extractTagsFromText, formatTagLabel } from "@/lib/activity-tags";
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
  className?: string;
}

interface TodayChecklistEditorRow extends TodayChecklistRow {
  id: number;
}

export function TodayChecklistEditor({
  value,
  onChange,
  isEditable = true,
  moveCompletedTasksToEnd = true,
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const pendingFocusIndexRef = useRef<number | null>(null);
  const pendingSerializedRef = useRef<string | null>(null);
  const onChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pendingFocusIndex = pendingFocusIndexRef.current;
    if (pendingFocusIndex === null) {
      return;
    }
    pendingFocusIndexRef.current = null;
    requestAnimationFrame(() => {
      inputRefs.current[pendingFocusIndex]?.focus();
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

  const handleTextChange = useCallback(
    (index: number, event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextRows = rows.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              text: event.target.value,
            }
          : row,
      );
      commitRows(nextRows);
    },
    [commitRows, rows],
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
      if (event.key === "Enter") {
        event.preventDefault();
        insertRowAfter(index);
        return;
      }

      if (
        event.key === "Backspace" &&
        rows[index]?.text.trim().length === 0 &&
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
    [commitRows, insertRowAfter, rows],
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
      }
    });
  }, [flushPendingChange]);

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
          onKeyDown={handleKeyDown}
          onFieldFocus={handleFieldFocus}
          onFieldBlur={handleFieldBlur}
          isFocused={activeRowId === row.id}
          isPendingDelete={pendingDeleteRowId === row.id}
          onRowFocus={handleRowFocus}
          onRowBlur={handleRowBlur}
          onDeleteClick={handleDeleteClick}
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
  onKeyDown: (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFieldFocus: () => void;
  onFieldBlur: () => void;
  isFocused: boolean;
  isPendingDelete: boolean;
  onRowFocus: (rowId: number) => void;
  onRowBlur: (rowId: number) => void;
  onDeleteClick: (rowId: number) => void;
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
  onKeyDown,
  onFieldFocus,
  onFieldBlur,
  isFocused,
  isPendingDelete,
  onRowFocus,
  onRowBlur,
  onDeleteClick,
  setInputRef,
}: TodayChecklistRowEditorProps) {
  const tags = extractTagsFromText(row.text);
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
        {tags.length > 0 ? (
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
  return { id: rowId, text: "", checked: false };
}

function attachRowIds(
  rows: TodayChecklistRow[],
  idRef: { current: number },
): TodayChecklistEditorRow[] {
  return rows.map((row) => ({
    id: idRef.current++,
    text: row.text,
    checked: row.checked,
  }));
}

function stripEditorRows(rows: TodayChecklistEditorRow[]): TodayChecklistRow[] {
  return rows.map(({ text, checked }) => ({ text, checked }));
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
    return {
      id: row.id,
      text: normalizedText,
      checked: row.checked && normalizedText.trim().length > 0,
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

function moveRowToEndBeforeTrailingEmptyRows<TRow extends TodayChecklistRow>(
  rows: TRow[],
  index: number,
): TRow[] {
  if (index < 0 || index >= rows.length) {
    return rows;
  }

  const rowToMove = rows[index];
  if (rowToMove.text.trim().length === 0) {
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

function findIndexBeforeTrailingEmptyRows<TRow extends TodayChecklistRow>(rows: TRow[]): number {
  let insertIndex = rows.length;

  while (insertIndex > 0 && rows[insertIndex - 1].text.trim().length === 0) {
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
