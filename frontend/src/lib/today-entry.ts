const TODAY_ENTRY_ID_PREFIX = "today-";
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TASK_LINE_PATTERN = /^- \[(?<checked>[ xX])\](?: (?<text>.*))?$/;
const TODAY_DATE_LABEL_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
};

export interface TodayChecklistRow {
  text: string;
  checked: boolean;
}

export function getUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getTodayEntryIdForDate(date: Date): string {
  return `${TODAY_ENTRY_ID_PREFIX}${getUtcDayKey(date)}`;
}

export function extractDayKeyFromTodayEntryId(entryId: string): string | null {
  if (!entryId.startsWith(TODAY_ENTRY_ID_PREFIX)) {
    return null;
  }
  const dayKey = entryId.slice(TODAY_ENTRY_ID_PREFIX.length);
  return DAY_KEY_PATTERN.test(dayKey) ? dayKey : null;
}

export function isTodayEntryForCurrentUtcDay(
  entryId: string,
  now: Date = new Date(),
): boolean {
  const dayKey = extractDayKeyFromTodayEntryId(entryId);
  if (!dayKey) {
    return false;
  }
  return dayKey === getUtcDayKey(now);
}

export function parseTodayChecklistMarkdown(markdown: string): TodayChecklistRow[] {
  const normalizedMarkdown = normalizeLineBreaks(markdown);
  if (normalizedMarkdown.trim().length === 0) {
    return [];
  }

  return normalizedMarkdown.split("\n").map((line) => {
    if (line.length === 0) {
      throw new Error("Today entries do not allow blank lines.");
    }
    const match = TASK_LINE_PATTERN.exec(line);
    if (!match) {
      throw new Error("Today entries support checklist rows only.");
    }
    const checked = (match.groups?.checked ?? " ").toLowerCase() === "x";
    const text = (match.groups?.text ?? "").trim();
    return { text, checked } satisfies TodayChecklistRow;
  });
}

export function normalizeTodayChecklistRows(
  rows: TodayChecklistRow[],
): TodayChecklistRow[] {
  const nonEmptyRows = rows
    .map((row) => ({
      text: row.text.trim(),
      checked: row.checked && row.text.trim().length > 0,
    }))
    .filter((row) => row.text.length > 0);

  return [...nonEmptyRows, { text: "", checked: false }];
}

export function serializeTodayChecklistRows(rows: TodayChecklistRow[]): string {
  if (rows.length === 0) {
    return "- [ ]";
  }

  return rows
    .map((row) => {
      const text = row.text.trim();
      if (!text) {
        return "- [ ]";
      }
      return `- [${row.checked ? "x" : " "}] ${text}`;
    })
    .join("\n");
}

export function normalizeTodayChecklistMarkdown(markdown: string): string {
  const rows = parseTodayChecklistMarkdown(markdown);
  return serializeTodayChecklistRows(normalizeTodayChecklistRows(rows));
}

export function buildTodayChecklistMarkdownFromTasks(tasks: string[]): string {
  const rows = tasks
    .map((task) => task.trim())
    .filter((task) => task.length > 0)
    .map((task) => ({ text: task, checked: false }));
  return serializeTodayChecklistRows(normalizeTodayChecklistRows(rows));
}

export function extractIncompleteTasksFromTodayMarkdown(markdown: string): string[] {
  return parseTodayChecklistMarkdown(markdown)
    .filter((row) => !row.checked && row.text.length > 0)
    .map((row) => row.text);
}

export function getTodayEntryDisplayTitle(
  entryId: string,
  occurredAtIso: string,
  now: Date = new Date(),
): string {
  const dayKey = extractDayKeyFromTodayEntryId(entryId);
  if (!dayKey) {
    return "Today";
  }
  if (dayKey === getUtcDayKey(now)) {
    return "Today";
  }

  const dayDate = new Date(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(dayDate.getTime())) {
    const occurredAt = new Date(occurredAtIso);
    if (Number.isNaN(occurredAt.getTime())) {
      return dayKey;
    }
    return occurredAt.toLocaleDateString(undefined, TODAY_DATE_LABEL_OPTIONS);
  }

  return dayDate.toLocaleDateString(undefined, TODAY_DATE_LABEL_OPTIONS);
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export { TODAY_ENTRY_ID_PREFIX };
