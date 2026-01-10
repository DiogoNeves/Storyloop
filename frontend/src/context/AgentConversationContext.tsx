import {
  type ReactNode,
  useCallback,
  useMemo,
  useContext,
  createContext,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";

import { healthQueries } from "@/api/health";
import { useAgentConversation, useAgentDemo } from "@/hooks";
import type {
  AgentConversationAdapter,
  AgentConversationState,
  AgentFocus,
} from "@/lib/types/agent";

interface AgentConversationContextValue {
  state: AgentConversationState;
  adapter: AgentConversationAdapter;
  focus: AgentFocus | null;
  setFocus: (focus: AgentFocus | null) => void;
  setActiveConversation: (conversationId?: string | null) => Promise<void>;
  isDemo: boolean;
  isInitializing: boolean;
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
  // Focus stays in-memory to ground the current turn only.
  const [focus, setFocus] = useState<AgentFocus | null>(null);
  const {
    state: conversationState,
    adapter: conversationAdapter,
    setActiveConversation: baseSetActiveConversation,
    isInitializing,
  } = useAgentConversation({ enabled: !isDemoMode, focus });

  const setActiveConversation = useCallback(
    async (conversationId?: string | null) => {
      if (isDemoMode) {
        return;
      }
      await baseSetActiveConversation(conversationId ?? null);
    },
    [baseSetActiveConversation, isDemoMode],
  );

  const value = useMemo(
    () => ({
      state: isDemoMode ? demo.state : conversationState,
      adapter: isDemoMode ? demo.adapter : conversationAdapter,
      focus: isDemoMode ? null : focus,
      setFocus: isDemoMode ? () => undefined : setFocus,
      setActiveConversation,
      isDemo: isDemoMode,
      isInitializing: !isDemoMode && isInitializing,
    }),
    [
      conversationAdapter,
      conversationState,
      demo.adapter,
      demo.state,
      focus,
      isInitializing,
      isDemoMode,
      setActiveConversation,
      setFocus,
    ],
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
