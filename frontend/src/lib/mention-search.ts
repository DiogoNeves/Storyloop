export interface MentionCandidate {
  query: string;
  startIndex: number;
}

export function findMentionCandidate(text: string): MentionCandidate | null {
  if (!text.includes("@")) {
    return null;
  }

  const atIndex = text.lastIndexOf("@");
  if (atIndex === -1) {
    return null;
  }

  if (atIndex > 0 && !/\s/.test(text[atIndex - 1])) {
    return null;
  }

  const query = text.slice(atIndex + 1);
  if (/\s/.test(query)) {
    return null;
  }

  return { query, startIndex: atIndex };
}
