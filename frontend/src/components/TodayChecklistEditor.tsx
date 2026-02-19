import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Plus } from "lucide-react";

import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Button } from "@/components/ui/button";
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
  const [rows, setRows] = useState<TodayChecklistRow[]>(rowsFromValue);
  const [isInteracting, setIsInteracting] = useState(false);
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
    const currentSerialized = serializeRowsForStorage(rows);
    if (nextSerialized !== currentSerialized) {
      setRows(rowsFromValue);
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
    (nextRows: TodayChecklistRow[], immediate = false) => {
      const normalized = normalizeRowsForCommit(nextRows);
      setRows(normalized);
      scheduleChange(serializeRowsForStorage(normalized), immediate);
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
      nextRows.splice(insertIndex, 0, { text: "", checked: false });
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
        <div
          key={`today-row-${index}`}
          className="flex items-start gap-2 rounded-md border border-border/50 bg-background/60 px-3 py-2"
        >
          <input
            type="checkbox"
            checked={row.checked}
            disabled={!isEditable}
            className="mt-1 h-4 w-4 accent-primary"
            onChange={(event) => {
              handleCheckedChange(index, event.target.checked);
            }}
            onFocus={handleFieldFocus}
            onBlur={handleFieldBlur}
            aria-label={`Toggle task ${index + 1}`}
          />
          <AutoResizeTextarea
            ref={(element) => {
              inputRefs.current[index] = element;
            }}
            value={row.text}
            onChange={(event) => {
              handleTextChange(index, event);
            }}
            onKeyDown={(event) => {
              handleKeyDown(index, event);
            }}
            onFocus={handleFieldFocus}
            onBlur={handleFieldBlur}
            readOnly={!isEditable}
            placeholder={index === rows.length - 1 ? "Type a task…" : ""}
            minRows={1}
            className="min-h-0 resize-none overflow-hidden border-0 bg-transparent px-1 py-0 text-sm leading-6 shadow-none focus-visible:ring-0"
          />
        </div>
      ))}
      {isEditable ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addTaskRow}
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

function normalizeRowsForCommit(rows: TodayChecklistRow[]): TodayChecklistRow[] {
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

function moveRowToEndBeforeTrailingEmptyRows(
  rows: TodayChecklistRow[],
  index: number,
): TodayChecklistRow[] {
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

function findIndexBeforeTrailingEmptyRows(rows: TodayChecklistRow[]): number {
  let insertIndex = rows.length;

  while (insertIndex > 0 && rows[insertIndex - 1].text.trim().length === 0) {
    insertIndex -= 1;
  }

  return insertIndex;
}

function normalizeRowsFromValue(rows: TodayChecklistRow[]): TodayChecklistRow[] {
  const normalizedRows = normalizeRowsForCommit(rows);

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
