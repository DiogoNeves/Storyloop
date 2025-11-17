export type AgentMessageRole = "user" | "assistant" | "system" | "tool";

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  createdAt: string;
  annotations?: AgentMessageAnnotation[];
}

export interface AgentMessageAnnotation {
  id: string;
  label: string;
  description?: string;
}

export interface AgentToolSignal {
  id: string;
  label: string;
}

export interface AgentComposerState {
  status: "idle" | "sending" | "responding";
  error?: string | null;
}

export interface AgentConversationState {
  conversationId: string;
  messages: AgentMessage[];
  toolSignals: AgentToolSignal[];
  composer: AgentComposerState;
}

export interface AgentConversationAdapter {
  sendMessage: (input: string) => Promise<void>;
  resetConversation: () => void;
}
