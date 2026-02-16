import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { Input } from "@/components/ui/input";
import {
  normalizeTodayChecklistRows,
  parseTodayChecklistMarkdown,
  serializeTodayChecklistRows,
  type TodayChecklistRow,
} from "@/lib/today-entry";
import { cn } from "@/lib/utils";

interface TodayChecklistEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  isEditable?: boolean;
  className?: string;
}

export function TodayChecklistEditor({
  value,
  onChange,
  isEditable = true,
  className,
}: TodayChecklistEditorProps) {
  const normalizedFromValue = useMemo(() => {
    try {
      return normalizeTodayChecklistRows(parseTodayChecklistMarkdown(value));
    } catch {
      return normalizeTodayChecklistRows([]);
    }
  }, [value]);
  const [rows, setRows] = useState<TodayChecklistRow[]>(normalizedFromValue);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const nextSerialized = serializeTodayChecklistRows(normalizedFromValue);
    const currentSerialized = serializeTodayChecklistRows(rows);
    if (nextSerialized !== currentSerialized) {
      setRows(normalizedFromValue);
    }
  }, [normalizedFromValue, rows]);

  const commitRows = useCallback(
    (nextRows: TodayChecklistRow[]) => {
      const normalized = normalizeTodayChecklistRows(nextRows);
      setRows(normalized);
      onChange(serializeTodayChecklistRows(normalized));
    },
    [onChange],
  );

  const handleTextChange = useCallback(
    (index: number, event: ChangeEvent<HTMLInputElement>) => {
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
      const nextRows = rows.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              checked,
            }
          : row,
      );
      commitRows(nextRows);
    },
    [commitRows, rows],
  );

  const handleKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const nextRows = [...rows];
        nextRows.splice(index + 1, 0, { text: "", checked: false });
        commitRows(nextRows);
        requestAnimationFrame(() => {
          inputRefs.current[index + 1]?.focus();
        });
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
        commitRows(nextRows);
        requestAnimationFrame(() => {
          inputRefs.current[nextFocusIndex]?.focus();
        });
      }
    },
    [commitRows, rows],
  );

  return (
    <div className={cn("space-y-2", className)}>
      {rows.map((row, index) => (
        <div
          key={`today-row-${index}`}
          className="flex items-center gap-2 rounded-md border border-border/50 bg-background/60 px-3 py-2"
        >
          <input
            type="checkbox"
            checked={row.checked}
            disabled={!isEditable}
            className="h-4 w-4 accent-primary"
            onChange={(event) => {
              handleCheckedChange(index, event.target.checked);
            }}
            aria-label={`Toggle task ${index + 1}`}
          />
          <Input
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
            readOnly={!isEditable}
            placeholder={index === rows.length - 1 ? "Type a task…" : ""}
            className="h-8 border-0 bg-transparent px-1 py-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      ))}
    </div>
  );
}
