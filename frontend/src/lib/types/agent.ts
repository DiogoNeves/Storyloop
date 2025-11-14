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

export interface AgentSuggestedPrompt {
  id: string;
  label: string;
  prompt: string;
}

export interface AgentComposerState {
  status: "idle" | "sending" | "responding";
  error?: string | null;
}

export interface AgentConversationState {
  conversationId: string;
  messages: AgentMessage[];
  suggestedPrompts: AgentSuggestedPrompt[];
  composer: AgentComposerState;
}

export interface AgentConversationAdapter {
  sendMessage: (input: string) => Promise<void>;
  resetConversation: () => void;
  acknowledgeSuggestion: (suggestion: AgentSuggestedPrompt) => void;
}
