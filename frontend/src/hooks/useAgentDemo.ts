import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type AgentConversationAdapter,
  type AgentConversationState,
  type AgentMessage,
  type AgentSuggestedPrompt,
} from "@/lib/types/agent";

interface UseAgentDemoOptions {
  enabled?: boolean;
}

const demoSuggestedPrompts: AgentSuggestedPrompt[] = [
  {
    id: "growth-plan",
    label: "Weekly growth plan",
    prompt:
      "Give me a focused growth plan for the next 7 days based on my latest metrics.",
  },
  {
    id: "video-hook",
    label: "Improve my next hook",
    prompt:
      "How can I sharpen the hook for my next long-form upload to retain viewers?",
  },
  {
    id: "journal-reflection",
    label: "Journal reflection",
    prompt:
      "Summarize the biggest lesson from this week's experiments and how to share it with my audience.",
  },
];

const demoIntroMessages: AgentMessage[] = [
  {
    id: "demo-assistant-1",
    role: "assistant",
    content:
      "Hey there! I studied your latest uploads and performance notes. Ask me for a growth plan, a script punch-up, or a reflection. I'm in demo mode, but the flow matches the real agent we'll plug in soon.",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "demo-user-1",
    role: "user",
    content:
      "Remind me what worked best from last week's experiments?",
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
  },
  {
    id: "demo-assistant-2",
    role: "assistant",
    content:
      "Doubling down on the teaser beat at 00:21 raised average view duration to 64%. Viewers also replayed the visual punchline, so keeping that pacing shift is a win.",
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
  },
];

function buildAssistantReply(
  input: string,
  history: AgentMessage[],
): AgentMessage {
  const lastUserMessage = [...history]
    .reverse()
    .find((message) => message.role === "user");

  const anchor = lastUserMessage?.content ?? input;
  const createdAt = new Date().toISOString();

  const insight =
    "Try testing a tighter first five seconds with a punch-in and an on-screen prompt to reinforce the hook.";
  const action =
    "Outline a three-beat structure: hook, reveal, actionable takeaway. Share it with collaborators so everyone aligns on the pacing.";

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    createdAt,
    content: `Here's what stood out from that request:\n\n• ${anchor}\n• ${insight}\n\nNext move: ${action}`,
  };
}

export function useAgentDemo({ enabled = true }: UseAgentDemoOptions = {}) {
  const [state, setState] = useState<AgentConversationState>(() => ({
    conversationId: crypto.randomUUID(),
    messages: demoIntroMessages,
    suggestedPrompts: demoSuggestedPrompts,
    composer: { status: "idle", error: null },
  }));

  const typingDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (typingDelayRef.current) {
      clearTimeout(typingDelayRef.current);
      typingDelayRef.current = null;
    }
    if (responseDelayRef.current) {
      clearTimeout(responseDelayRef.current);
      responseDelayRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const sendMessage = useCallback(
    async (input: string) => {
      if (!enabled) {
        return;
      }

      const trimmed = input.trim();
      if (!trimmed) {
        return;
      }

      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setState((previous) => ({
        ...previous,
        messages: [...previous.messages, userMessage],
        composer: { status: "sending", error: null },
      }));

      await new Promise<void>((resolve) => {
        typingDelayRef.current = setTimeout(() => {
          setState((previous) => ({
            ...previous,
            composer: { status: "responding", error: null },
          }));

          responseDelayRef.current = setTimeout(() => {
            setState((previous) => ({
              ...previous,
              messages: [
                ...previous.messages,
                buildAssistantReply(trimmed, previous.messages),
              ],
              composer: { status: "idle", error: null },
              suggestedPrompts: previous.suggestedPrompts.filter(
                (suggestion) => suggestion.prompt !== trimmed,
              ),
            }));
            resolve();
          }, 900);
        }, 320);
      });
    },
    [enabled],
  );

  const resetConversation = useCallback(() => {
    if (!enabled) {
      return;
    }
    clearTimers();
    setState({
      conversationId: crypto.randomUUID(),
      messages: demoIntroMessages,
      suggestedPrompts: demoSuggestedPrompts,
      composer: { status: "idle", error: null },
    });
  }, [clearTimers, enabled]);

  const acknowledgeSuggestion = useCallback(
    (suggestion: AgentSuggestedPrompt) => {
      if (!enabled) {
        return;
      }
      setState((previous) => ({
        ...previous,
        suggestedPrompts: previous.suggestedPrompts.filter(
          (item) => item.id !== suggestion.id,
        ),
      }));
      void sendMessage(suggestion.prompt);
    },
    [enabled, sendMessage],
  );

  const adapter = useMemo<AgentConversationAdapter>(
    () => ({
      sendMessage,
      resetConversation,
      acknowledgeSuggestion,
    }),
    [acknowledgeSuggestion, resetConversation, sendMessage],
  );

  return useMemo(
    () => ({
      state,
      adapter,
    }),
    [adapter, state],
  );
}
