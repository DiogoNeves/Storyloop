export function parseValidDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatLongDateTime(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  return date.toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export function formatDateTimeLocalInput(now: Date): string {
  const normalized = new Date(now);
  normalized.setSeconds(0);
  normalized.setMilliseconds(0);
  const offset = normalized.getTimezoneOffset();
  const adjusted = new Date(normalized.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 16);
}
