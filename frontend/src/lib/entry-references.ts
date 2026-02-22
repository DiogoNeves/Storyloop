export interface EntryReferenceToken {
  entryId: string;
  token: string;
  start: number;
  end: number;
}

export interface EntryReferenceRecord {
  id: string;
  title: string;
}

export const ENTRY_REFERENCE_LINK_PREFIX = "/entryref/";

const ENTRY_REFERENCE_TOKEN_PATTERN = /@entry:([A-Za-z0-9][A-Za-z0-9_-]*)/g;
const ENTRY_REFERENCE_BOUNDARY_PATTERN = /[^A-Za-z0-9_-]/;

function isBoundaryCharacter(character: string | undefined): boolean {
  if (!character) {
    return true;
  }
  return ENTRY_REFERENCE_BOUNDARY_PATTERN.test(character);
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export function extractEntryReferenceTokens(text: string): EntryReferenceToken[] {
  const tokens: EntryReferenceToken[] = [];
  ENTRY_REFERENCE_TOKEN_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(ENTRY_REFERENCE_TOKEN_PATTERN)) {
    const token = match[0];
    const entryId = match[1];
    const start = match.index;
    if (!token || !entryId || typeof start !== "number") {
      continue;
    }

    const end = start + token.length;
    const previousCharacter = start > 0 ? text[start - 1] : undefined;
    const nextCharacter = end < text.length ? text[end] : undefined;
    if (!isBoundaryCharacter(previousCharacter)) {
      continue;
    }
    if (!isBoundaryCharacter(nextCharacter)) {
      continue;
    }

    tokens.push({
      entryId,
      token,
      start,
      end,
    });
  }

  return tokens;
}

export function extractEntryReferenceIds(text: string): string[] {
  const seen = new Set<string>();
  const orderedIds: string[] = [];

  extractEntryReferenceTokens(text).forEach((reference) => {
    if (seen.has(reference.entryId)) {
      return;
    }
    seen.add(reference.entryId);
    orderedIds.push(reference.entryId);
  });

  return orderedIds;
}

export function buildEntryReferenceTitleMap(
  records: EntryReferenceRecord[],
): Record<string, string> {
  return records.reduce<Record<string, string>>((accumulator, record) => {
    const title = record.title.trim();
    if (title) {
      accumulator[record.id] = title;
    }
    return accumulator;
  }, {});
}

export function resolveEntryReferenceLabel(
  entryId: string,
  titleById: Record<string, string>,
): string {
  return titleById[entryId] ?? `Entry ${entryId}`;
}

export function replaceEntryReferenceTokensWithMarkdownLinks(
  text: string,
  titleById: Record<string, string>,
): string {
  const tokens = extractEntryReferenceTokens(text);
  if (tokens.length === 0) {
    return text;
  }

  let cursor = 0;
  let transformed = "";

  tokens.forEach((reference) => {
    transformed += text.slice(cursor, reference.start);
    const label = resolveEntryReferenceLabel(reference.entryId, titleById);
    transformed += `[${escapeMarkdownLabel(label)}](${ENTRY_REFERENCE_LINK_PREFIX}${reference.entryId})`;
    cursor = reference.end;
  });

  transformed += text.slice(cursor);
  return transformed;
}
