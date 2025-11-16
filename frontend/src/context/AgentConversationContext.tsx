import { type ReactNode, useCallback, useMemo, useContext, createContext } from "react";
import { useQuery } from "@tanstack/react-query";

import { healthQueries } from "@/api/health";
import { useAgentConversation, useAgentDemo } from "@/hooks";
import type {
  AgentConversationAdapter,
  AgentConversationState,
} from "@/lib/types/agent";

interface AgentConversationContextValue {
  state: AgentConversationState;
  adapter: AgentConversationAdapter;
  setActiveConversation: (conversationId?: string | null) => Promise<void>;
  isDemo: boolean;
}

const AgentConversationContext =
  createContext<AgentConversationContextValue | undefined>(undefined);

interface AgentConversationProviderProps {
  children: ReactNode;
}

export function AgentConversationProvider({
  children,
}: AgentConversationProviderProps) {
  const healthQuery = useQuery(healthQueries.status());
  const isDemoMode =
    healthQuery.data?.youtubeDemoMode === true || healthQuery.isError;

  const demo = useAgentDemo({ enabled: isDemoMode });
  const conversation = useAgentConversation({ enabled: !isDemoMode });

  const setActiveConversation = useCallback(
    async (conversationId?: string | null) => {
      if (isDemoMode) {
        return;
      }
      await conversation.setActiveConversation(conversationId ?? null);
    },
    [conversation, isDemoMode],
  );

  const value = useMemo(
    () => ({
      state: isDemoMode ? demo.state : conversation.state,
      adapter: isDemoMode ? demo.adapter : conversation.adapter,
      setActiveConversation,
      isDemo: isDemoMode,
    }),
    [conversation.adapter, conversation.state, demo.adapter, demo.state, isDemoMode, setActiveConversation],
  );

  return (
    <AgentConversationContext.Provider value={value}>
      {children}
    </AgentConversationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAgentConversationContext() {
  const context = useContext(AgentConversationContext);
  if (!context) {
    throw new Error(
      "useAgentConversationContext must be used within an AgentConversationProvider",
    );
  }
  return context;
}
