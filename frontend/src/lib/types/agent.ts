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

export interface AgentComposerState {
  status: "idle" | "sending" | "responding";
  error?: string | null;
}

export interface AgentToolSignal {
  id: string;
  message: string;
  receivedAt: string;
}

export interface AgentConversationState {
  conversationId: string;
  messages: AgentMessage[];
  composer: AgentComposerState;
  toolSignals: AgentToolSignal[];
}

export interface AgentConversationAdapter {
  sendMessage: (input: string) => Promise<void>;
  resetConversation: () => void;
}
