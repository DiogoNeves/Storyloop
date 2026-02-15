/**
 * Append transcribed text to existing composer input while preserving existing text.
 */
export function appendTranscribedText(existing: string, transcript: string): string {
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) {
    return existing;
  }

  if (existing.length === 0) {
    return normalizedTranscript;
  }

  const needsSpacer = !/[\s\n]$/.test(existing);
  return needsSpacer
    ? `${existing} ${normalizedTranscript}`
    : `${existing}${normalizedTranscript}`;
}
