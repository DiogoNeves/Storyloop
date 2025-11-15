import { useAgentConversation } from "./useAgentConversation";
import { useAgentDemo } from "./useAgentDemo";
import type {
  AgentConversationAdapter,
  AgentConversationState,
} from "@/lib/types/agent";

interface UseAgentResult {
  state: AgentConversationState;
  adapter: AgentConversationAdapter;
}

/**
 * Unified hook that returns either demo or live agent based on VITE_YOUTUBE_DEMO_MODE.
 * When demo mode is enabled, uses the fake demo implementation.
 * Otherwise, uses the real backend conversation API.
 */
export function useAgent(): UseAgentResult {
  const isDemoMode =
    import.meta.env.VITE_YOUTUBE_DEMO_MODE === "true" ||
    import.meta.env.VITE_YOUTUBE_DEMO_MODE === "1";

  const demo = useAgentDemo({ enabled: isDemoMode });
  const live = useAgentConversation();

  return isDemoMode ? demo : live;
}

