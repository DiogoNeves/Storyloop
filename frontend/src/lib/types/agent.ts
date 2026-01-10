export type AgentMessageRole = "user" | "assistant" | "system" | "tool";

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  createdAt: string;
  attachments?: AgentMessageAttachment[];
  annotations?: AgentMessageAnnotation[];
}

export interface AgentMessageAttachment {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
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

export type AgentFocusCategory = "content" | "journal";

export interface AgentFocus {
  category: AgentFocusCategory;
  id: string;
  title?: string | null;
  route?: string | null;
}

export interface AgentConversationState {
  conversationId: string;
  messages: AgentMessage[];
  composer: AgentComposerState;
  toolSignals: AgentToolSignal[];
}

export interface AgentConversationAdapter {
  sendMessage: (
    input: string,
    attachments?: AgentMessageAttachment[],
  ) => Promise<void>;
  stopResponse: () => void;
  resetConversation: () => void;
}
