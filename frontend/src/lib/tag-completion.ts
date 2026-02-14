export interface TagCandidate {
  from: number;
  to: number;
  query: string;
}

export function findTagCandidate(
  textBeforeCursor: string,
  parentStart: number,
  cursorPosition: number,
): TagCandidate | null {
  const match = textBeforeCursor.match(/(?:^|[\s([{])#([A-Za-z0-9][A-Za-z0-9/-]*)$/);
  if (!match?.[1]) {
    return null;
  }

  const tokenStart = textBeforeCursor.length - match[1].length - 1;
  return {
    from: parentStart + tokenStart + 1,
    to: cursorPosition,
    query: match[1].toLowerCase(),
  };
}

export function findTagCompletion(query: string, possibleTags: string[]): string | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const matches = possibleTags.filter(
    (tag) => tag.startsWith(normalizedQuery) && tag.length > normalizedQuery.length,
  );
  if (matches.length === 0) {
    return null;
  }

  const commonPrefix = matches.reduce((prefix, match) =>
    longestCommonPrefix(prefix, match),
  );
  if (commonPrefix.length <= normalizedQuery.length) {
    return null;
  }

  return commonPrefix.slice(normalizedQuery.length);
}

function longestCommonPrefix(left: string, right: string): string {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) {
    index += 1;
  }
  return left.slice(0, index);
}
