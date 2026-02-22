import { useCallback, useMemo, useRef } from "react";

import {
  extractEntryReferenceTokens,
  resolveEntryReferenceLabel,
} from "@/lib/entry-references";

export interface InlineReferenceSegmentText {
  type: "text";
  value: string;
}

export interface InlineReferenceSegmentReference {
  type: "reference";
  entryId: string;
  label: string;
  marker: string;
  token: string;
  key: string;
}

export type InlineReferenceSegment =
  | InlineReferenceSegmentText
  | InlineReferenceSegmentReference;

const REFERENCE_MARKER_START = 0xe000;
const REFERENCE_MARKER_END = 0xf8ff;

function isReferenceMarker(value: string): boolean {
  if (!value) {
    return false;
  }

  const codePoint = value.codePointAt(0);
  if (typeof codePoint !== "number") {
    return false;
  }

  return codePoint >= REFERENCE_MARKER_START && codePoint <= REFERENCE_MARKER_END;
}

interface UseLoopieReferenceComposerOptions {
  inputValue: string;
  entryReferenceTitles: Record<string, string>;
}

interface UseLoopieReferenceComposerResult {
  inlineReferenceSegments: InlineReferenceSegment[];
  hasInlineReferences: boolean;
  normalizeCanonicalTokensToMarkers: (
    value: string,
    cursorPosition: number | null,
  ) => { value: string; cursorPosition: number | null };
  decodeMarkersToCanonicalTokens: (value: string) => string;
  createReferenceInsertion: (entryId: string) => string;
  resetReferenceMarkers: () => void;
}

export function useLoopieReferenceComposer({
  inputValue,
  entryReferenceTitles,
}: UseLoopieReferenceComposerOptions): UseLoopieReferenceComposerResult {
  const referenceMarkerToEntryIdRef = useRef<Map<string, string>>(new Map());
  const nextReferenceMarkerCodeRef = useRef(REFERENCE_MARKER_START);

  const createReferenceMarker = useCallback((entryId: string): string => {
    const usedMarkers = referenceMarkerToEntryIdRef.current;
    let attempts = 0;

    while (attempts <= REFERENCE_MARKER_END - REFERENCE_MARKER_START) {
      const code = nextReferenceMarkerCodeRef.current;
      const marker = String.fromCharCode(code);
      nextReferenceMarkerCodeRef.current =
        code >= REFERENCE_MARKER_END ? REFERENCE_MARKER_START : code + 1;
      attempts += 1;

      if (usedMarkers.has(marker)) {
        continue;
      }

      usedMarkers.set(marker, entryId);
      return marker;
    }

    // Practically unreachable, but still deterministic if marker space is exhausted.
    const fallbackMarker = String.fromCharCode(REFERENCE_MARKER_START);
    usedMarkers.set(fallbackMarker, entryId);
    return fallbackMarker;
  }, []);

  const pruneReferenceMarkers = useCallback((value: string) => {
    const activeMarkers = new Set<string>();
    for (const character of value) {
      if (isReferenceMarker(character)) {
        activeMarkers.add(character);
      }
    }

    const markerMap = referenceMarkerToEntryIdRef.current;
    [...markerMap.keys()].forEach((marker) => {
      if (!activeMarkers.has(marker)) {
        markerMap.delete(marker);
      }
    });
  }, []);

  const normalizeCanonicalTokensToMarkers = useCallback(
    (value: string, cursorPosition: number | null) => {
      const referencesToNormalize = extractEntryReferenceTokens(value).filter(
        (reference) =>
          !(
            cursorPosition !== null &&
            cursorPosition === value.length &&
            reference.end === value.length
          ),
      );

      if (referencesToNormalize.length === 0) {
        pruneReferenceMarkers(value);
        return { value, cursorPosition };
      }

      let nextValue = "";
      let previousEnd = 0;
      let nextCursor = cursorPosition;

      referencesToNormalize.forEach((reference) => {
        nextValue += value.slice(previousEnd, reference.start);
        const marker = createReferenceMarker(reference.entryId);
        const label = resolveEntryReferenceLabel(
          reference.entryId,
          entryReferenceTitles,
        );
        const replacement = `${marker} ${label} ${marker}`;
        nextValue += replacement;

        if (nextCursor !== null) {
          if (nextCursor > reference.end) {
            nextCursor += replacement.length - (reference.end - reference.start);
          } else if (nextCursor > reference.start) {
            nextCursor = nextValue.length;
          }
        }

        previousEnd = reference.end;
      });

      nextValue += value.slice(previousEnd);
      pruneReferenceMarkers(nextValue);
      return { value: nextValue, cursorPosition: nextCursor };
    },
    [createReferenceMarker, entryReferenceTitles, pruneReferenceMarkers],
  );

  const decodeMarkersToCanonicalTokens = useCallback((value: string): string => {
    let decoded = "";

    for (let index = 0; index < value.length; ) {
      const character = value[index] ?? "";
      if (!isReferenceMarker(character)) {
        decoded += character;
        index += 1;
        continue;
      }

      const entryId = referenceMarkerToEntryIdRef.current.get(character);
      const closingIndex = value.indexOf(character, index + 1);
      if (entryId && closingIndex >= 0) {
        decoded += `@entry:${entryId}`;
        index = closingIndex + 1;
        continue;
      }

      if (entryId) {
        index += 1;
        continue;
      }

      decoded += character;
      index += 1;
    }

    return decoded;
  }, []);

  const inlineReferenceSegments = useMemo<InlineReferenceSegment[]>(() => {
    const segments: InlineReferenceSegment[] = [];
    let textBuffer = "";
    let index = 0;

    while (index < inputValue.length) {
      const character = inputValue[index] ?? "";
      if (!isReferenceMarker(character)) {
        textBuffer += character;
        index += 1;
        continue;
      }

      const entryId = referenceMarkerToEntryIdRef.current.get(character);
      const closingIndex = inputValue.indexOf(character, index + 1);
      if (!entryId || closingIndex < 0) {
        textBuffer += character;
        index += 1;
        continue;
      }

      if (textBuffer.length > 0) {
        segments.push({
          type: "text",
          value: textBuffer,
        });
        textBuffer = "";
      }

      segments.push({
        type: "reference",
        entryId,
        label: resolveEntryReferenceLabel(entryId, entryReferenceTitles),
        marker: character,
        token: `@entry:${entryId}`,
        key: `${index}-${entryId}`,
      });
      index = closingIndex + 1;
    }

    if (textBuffer.length > 0) {
      segments.push({
        type: "text",
        value: textBuffer,
      });
    }

    return segments;
  }, [entryReferenceTitles, inputValue]);

  const hasInlineReferences = inlineReferenceSegments.some(
    (segment) => segment.type === "reference",
  );

  const createReferenceInsertion = useCallback(
    (entryId: string): string => {
      const marker = createReferenceMarker(entryId);
      const label = resolveEntryReferenceLabel(entryId, entryReferenceTitles);
      return `${marker} ${label} ${marker} `;
    },
    [createReferenceMarker, entryReferenceTitles],
  );

  const resetReferenceMarkers = useCallback(() => {
    referenceMarkerToEntryIdRef.current.clear();
    nextReferenceMarkerCodeRef.current = REFERENCE_MARKER_START;
  }, []);

  return {
    inlineReferenceSegments,
    hasInlineReferences,
    normalizeCanonicalTokensToMarkers,
    decodeMarkersToCanonicalTokens,
    createReferenceInsertion,
    resetReferenceMarkers,
  };
}
