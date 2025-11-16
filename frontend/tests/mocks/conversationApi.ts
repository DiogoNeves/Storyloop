import { vi } from "vitest";

export const mockConversationList = vi.fn().mockResolvedValue([]);
export const mockCreateConversation = vi.fn().mockResolvedValue({
  id: "conversation-mock",
  title: "Loopie mock conversation",
  createdAt: new Date(0).toISOString(),
  lastTurnAt: null,
  lastTurnText: null,
  turnCount: 0,
});
export const mockListConversationTurns = vi.fn().mockResolvedValue([]);
export const mockStreamConversationTurn = vi.fn().mockResolvedValue(undefined);
export const mockDeleteConversation = vi.fn().mockResolvedValue(undefined);

vi.mock("@/api/conversations", () => ({
  conversationQueries: {
    list: () => ({
      queryKey: ["conversations"],
      queryFn: mockConversationList,
    }),
  },
  createConversation: mockCreateConversation,
  listConversationTurns: mockListConversationTurns,
  streamConversationTurn: mockStreamConversationTurn,
  deleteConversation: mockDeleteConversation,
  isNotFoundError: () => false,
}));
