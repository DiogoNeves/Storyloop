import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type AgentConversationAdapter,
  type AgentConversationState,
  type AgentMessage,
} from "@/lib/types/agent";

interface UseAgentDemoOptions {
  enabled?: boolean;
}

const demoIntroMessages: AgentMessage[] = [
  {
    id: "demo-assistant-1",
    role: "assistant",
    // Extend these demo messages with more Markdown patterns as the renderer grows.
    content:
      "# Channel Growth Overview\n\nHere is a quick snapshot of your recent experiments. Hop into the docs for more: [Storyloop Docs](https://example.com/docs).\n\n## Highlights\n\n- Improved retention on the last three uploads\n- Thumbnail click-through rose after the purple accent test\n- More consistent Sunday release schedule\n\nTwo concept frames from your recent shoot:\n\n![Warm sunrise frame](/demo/loopie-warm.png)\n\n![Night neon frame](/demo/loopie-neon.png)\n\nHere is a table of key metrics:\n\n| Video | CTR | Avg View Duration | Notes |\n| --- | --- | --- | --- |\n| Launch Recap | 7.8% | 4:21 | Strong intro hook |\n| Devlog #3 | 5.2% | 3:17 | Drop at 1:10 mark |\n| Storyloop Teaser | 9.1% | 5:02 | Excellent retention |\n\nInline code looks like `pnpm run dev`, and longer snippets render below.",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "demo-user-1",
    role: "user",
    content: "Which parts of that format should I double down on next?",
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
  },
  {
    id: "demo-assistant-2",
    role: "assistant",
    content:
      "Great question! I pulled together the moments worth repeating.\n\n> Keep the cold open under 6 seconds and include a visual surprise; that's where replay spikes show up.\n\n1. Script a **three-beat hook**: tease, promise, reveal.\n2. Re-use the overlay that called out `00:21`—it drove the first retention jump.\n3. Close with a single CTA that links to the playlist.\n\nHere is a small snippet you can paste into your editor:\n\n```md\n## Hook ideas\n- Tease the reveal in the first 3 seconds\n- Mention the subscriber milestone as a fast brag\n- Ask a question that sets up the reveal\n```\n",
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
    composer: { status: "idle", error: null },
    toolSignals: [],
  }));

  const typingTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const responseTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const toolSignalTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  const clearTimers = useCallback(() => {
    typingTimersRef.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
    typingTimersRef.current.clear();

    responseTimersRef.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
    responseTimersRef.current.clear();

    toolSignalTimersRef.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
    toolSignalTimersRef.current.clear();
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const stopResponse = useCallback(() => {
    if (!enabled) {
      return;
    }

    clearTimers();
    setState((previous) => {
      if (previous.composer.status === "idle") {
        return previous;
      }

      const hasStopToken = previous.messages.some(
        (message) => message.content === "[user stopped]" && message.role === "system",
      );

      return {
        ...previous,
        messages: hasStopToken
          ? previous.messages
          : [
              ...previous.messages,
              {
                id: crypto.randomUUID(),
                role: "system",
                content: "[user stopped]",
                createdAt: new Date().toISOString(),
              },
            ],
        composer: { status: "idle", error: null },
        toolSignals: [],
      };
    });
  }, [clearTimers, enabled]);

  const sendMessage = useCallback(
    async (input: string, attachments: AgentMessage["attachments"] = []) => {
      if (!enabled) {
        return;
      }

      const trimmed = input.trim();
      if (!trimmed && attachments.length === 0) {
        return;
      }

      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
        attachments,
      };

      setState((previous) => ({
        ...previous,
        messages: [...previous.messages, userMessage],
        composer: { status: "sending", error: null },
        toolSignals: [],
      }));

      await new Promise<void>((resolve) => {
        const typingTimer = setTimeout(() => {
          typingTimersRef.current.delete(typingTimer);
          setState((previous) => ({
            ...previous,
            composer: { status: "responding", error: null },
          }));

          const toolSignalTimer = setTimeout(() => {
            toolSignalTimersRef.current.delete(toolSignalTimer);
            setState((previous) => ({
              ...previous,
              toolSignals: [
                ...previous.toolSignals,
                {
                  id: crypto.randomUUID(),
                  message: "👀 your latest journal entries",
                  receivedAt: new Date().toISOString(),
                },
              ],
            }));
          }, 120);
          toolSignalTimersRef.current.add(toolSignalTimer);

          const responseTimer = setTimeout(() => {
            responseTimersRef.current.delete(responseTimer);
            setState((previous) => ({
              ...previous,
              messages: [
                ...previous.messages,
                buildAssistantReply(trimmed, previous.messages),
              ],
              composer: { status: "idle", error: null },
              toolSignals: [],
            }));
            resolve();
          }, 900);
          responseTimersRef.current.add(responseTimer);
        }, 320);
        typingTimersRef.current.add(typingTimer);
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
      composer: { status: "idle", error: null },
      toolSignals: [],
    });
  }, [clearTimers, enabled]);

  const adapter = useMemo<AgentConversationAdapter>(
    () => ({
      sendMessage,
      stopResponse,
      resetConversation,
    }),
    [resetConversation, sendMessage, stopResponse],
  );

  return useMemo(
    () => ({
      state,
      adapter,
    }),
    [adapter, state],
  );
}
