interface ShouldSkipInitialMarkdownUpdateParams {
  hasSeenFirstMarkdownUpdate: boolean;
  initialValue: string;
  nextMarkdown: string;
}

export function shouldSkipInitialMarkdownUpdate({
  hasSeenFirstMarkdownUpdate,
  initialValue,
  nextMarkdown,
}: ShouldSkipInitialMarkdownUpdateParams): boolean {
  return !hasSeenFirstMarkdownUpdate && nextMarkdown === initialValue;
}
