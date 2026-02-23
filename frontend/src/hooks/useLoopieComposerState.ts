import { useCallback, useReducer } from "react";

import { findMentionStateAtCursor } from "@/lib/mention-search";
import type { AgentMessageAttachment } from "@/lib/types/agent";

export interface ComposerMentionState {
  query: string;
  startIndex: number;
  endIndex: number;
}

interface ComposerScrollOffset {
  top: number;
  left: number;
}

interface LoopieComposerState {
  inputValue: string;
  attachments: AgentMessageAttachment[];
  uploadError: string | null;
  mentionState: ComposerMentionState | null;
  mentionActiveIndex: number;
  composerScrollOffset: ComposerScrollOffset;
}

type InputValueUpdater = string | ((previous: string) => string);

type LoopieComposerAction =
  | { type: "set_input_value"; value: InputValueUpdater }
  | { type: "add_attachment"; attachment: AgentMessageAttachment }
  | { type: "remove_attachment"; attachmentId: string }
  | { type: "set_upload_error"; error: string | null }
  | { type: "update_mention_state"; mentionState: ComposerMentionState | null }
  | { type: "set_mention_active_index"; index: number }
  | {
      type: "cycle_mention_active_index";
      delta: number;
      suggestionsCount: number;
    }
  | { type: "clamp_mention_active_index"; maxIndex: number }
  | { type: "set_composer_scroll_offset"; offset: ComposerScrollOffset }
  | { type: "reset_composer_scroll_offset" }
  | { type: "clear_mention_state" }
  | { type: "reset_after_submit" };

const INITIAL_STATE: LoopieComposerState = {
  inputValue: "",
  attachments: [],
  uploadError: null,
  mentionState: null,
  mentionActiveIndex: 0,
  composerScrollOffset: {
    top: 0,
    left: 0,
  },
};

function findComposerMentionState(
  value: string,
  cursorPosition: number | null,
): ComposerMentionState | null {
  return findMentionStateAtCursor(value, cursorPosition);
}

function loopieComposerReducer(
  state: LoopieComposerState,
  action: LoopieComposerAction,
): LoopieComposerState {
  switch (action.type) {
    case "set_input_value": {
      const nextValue =
        typeof action.value === "function"
          ? action.value(state.inputValue)
          : action.value;
      return {
        ...state,
        inputValue: nextValue,
      };
    }
    case "add_attachment":
      return {
        ...state,
        attachments: [...state.attachments, action.attachment],
      };
    case "remove_attachment":
      return {
        ...state,
        attachments: state.attachments.filter(
          (attachment) => attachment.id !== action.attachmentId,
        ),
      };
    case "set_upload_error":
      return {
        ...state,
        uploadError: action.error,
      };
    case "update_mention_state": {
      if (!action.mentionState) {
        return {
          ...state,
          mentionState: null,
          mentionActiveIndex: 0,
        };
      }

      const isSameQuery = state.mentionState?.query === action.mentionState.query;
      return {
        ...state,
        mentionState: action.mentionState,
        mentionActiveIndex: isSameQuery ? state.mentionActiveIndex : 0,
      };
    }
    case "set_mention_active_index":
      return {
        ...state,
        mentionActiveIndex: Math.max(0, action.index),
      };
    case "cycle_mention_active_index": {
      if (action.suggestionsCount <= 0) {
        return state;
      }

      const nextIndex =
        (state.mentionActiveIndex + action.delta + action.suggestionsCount) %
        action.suggestionsCount;
      return {
        ...state,
        mentionActiveIndex: nextIndex,
      };
    }
    case "clamp_mention_active_index":
      return {
        ...state,
        mentionActiveIndex:
          action.maxIndex < 0
            ? 0
            : Math.min(state.mentionActiveIndex, action.maxIndex),
      };
    case "set_composer_scroll_offset":
      return {
        ...state,
        composerScrollOffset: action.offset,
      };
    case "reset_composer_scroll_offset":
      return {
        ...state,
        composerScrollOffset: { top: 0, left: 0 },
      };
    case "clear_mention_state":
      return {
        ...state,
        mentionState: null,
        mentionActiveIndex: 0,
      };
    case "reset_after_submit":
      return {
        ...state,
        inputValue: "",
        attachments: [],
        mentionState: null,
        mentionActiveIndex: 0,
      };
    default:
      return state;
  }
}

interface UseLoopieComposerStateResult {
  inputValue: string;
  attachments: AgentMessageAttachment[];
  uploadError: string | null;
  mentionState: ComposerMentionState | null;
  mentionActiveIndex: number;
  composerScrollOffset: ComposerScrollOffset;
  setInputValue: (value: InputValueUpdater) => void;
  addAttachment: (attachment: AgentMessageAttachment) => void;
  removeAttachment: (attachmentId: string) => void;
  setUploadError: (error: string | null) => void;
  updateMentionState: (nextValue: string, cursorPosition: number | null) => void;
  clearMentionState: () => void;
  setMentionActiveIndex: (index: number) => void;
  cycleMentionActiveIndex: (delta: number, suggestionsCount: number) => void;
  clampMentionActiveIndex: (suggestionsCount: number) => void;
  setComposerScrollOffset: (offset: ComposerScrollOffset) => void;
  resetComposerScrollOffset: () => void;
  resetAfterSubmit: () => void;
}

export function useLoopieComposerState(): UseLoopieComposerStateResult {
  const [state, dispatch] = useReducer(loopieComposerReducer, INITIAL_STATE);

  const setInputValue = useCallback((value: InputValueUpdater) => {
    dispatch({ type: "set_input_value", value });
  }, []);

  const addAttachment = useCallback((attachment: AgentMessageAttachment) => {
    dispatch({ type: "add_attachment", attachment });
  }, []);

  const removeAttachment = useCallback((attachmentId: string) => {
    dispatch({ type: "remove_attachment", attachmentId });
  }, []);

  const setUploadError = useCallback((error: string | null) => {
    dispatch({ type: "set_upload_error", error });
  }, []);

  const updateMentionState = useCallback(
    (nextValue: string, cursorPosition: number | null) => {
      dispatch({
        type: "update_mention_state",
        mentionState: findComposerMentionState(nextValue, cursorPosition),
      });
    },
    [],
  );

  const clearMentionState = useCallback(() => {
    dispatch({ type: "clear_mention_state" });
  }, []);

  const setMentionActiveIndex = useCallback((index: number) => {
    dispatch({ type: "set_mention_active_index", index });
  }, []);

  const cycleMentionActiveIndex = useCallback(
    (delta: number, suggestionsCount: number) => {
      dispatch({
        type: "cycle_mention_active_index",
        delta,
        suggestionsCount,
      });
    },
    [],
  );

  const clampMentionActiveIndex = useCallback((suggestionsCount: number) => {
    dispatch({
      type: "clamp_mention_active_index",
      maxIndex: suggestionsCount - 1,
    });
  }, []);

  const setComposerScrollOffset = useCallback((offset: ComposerScrollOffset) => {
    dispatch({ type: "set_composer_scroll_offset", offset });
  }, []);

  const resetComposerScrollOffset = useCallback(() => {
    dispatch({ type: "reset_composer_scroll_offset" });
  }, []);

  const resetAfterSubmit = useCallback(() => {
    dispatch({ type: "reset_after_submit" });
  }, []);

  return {
    ...state,
    setInputValue,
    addAttachment,
    removeAttachment,
    setUploadError,
    updateMentionState,
    clearMentionState,
    setMentionActiveIndex,
    cycleMentionActiveIndex,
    clampMentionActiveIndex,
    setComposerScrollOffset,
    resetComposerScrollOffset,
    resetAfterSubmit,
  };
}
