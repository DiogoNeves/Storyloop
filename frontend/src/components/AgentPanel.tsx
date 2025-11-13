import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useLocation } from "react-router-dom";

import {
  agentChat,
  type AgentMessage,
  type AgentRole,
  type AgentStreamEvent,
  type AgentStreamHandle,
  streamAgentChat,
} from "@/api/agent";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ConversationMessage extends AgentMessage {
  createdAt: string;
  status?: "pending" | "responding" | "responded";
  streamState?: "streaming" | "error" | "complete";
  respondingTo?: string;
  error?: string | null;
  remoteId?: string;
}

interface ActiveStream {
  handle: AgentStreamHandle;
  assistantId: string;
  userMessageId: string;
}

export function AgentPanel() {
  const location = useLocation();
  const sessionIdRef = useRef(createId("session"));
  const messagesRef = useRef<ConversationMessage[]>([]);
  const streamQueueRef = useRef<string[]>([]);
  const activeStreamRef = useRef<ActiveStream | null>(null);
  const isStreamingRef = useRef(false);
  const isMountedRef = useRef(true);

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      activeStreamRef.current?.handle.abort();
    };
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const applyMessagesUpdate = useCallback(
    (updater: (prev: ConversationMessage[]) => ConversationMessage[]) => {
      if (!isMountedRef.current) {
        return;
      }
      setMessages((prev) => {
        const next = updater(prev);
        messagesRef.current = next;
        return next;
      });
    },
    [],
  );

  const markQueueAsIdle = useCallback(
    (completedMessageId: string) => {
      const queue = streamQueueRef.current;
      if (queue.length === 0) {
        return;
      }

      if (queue[0] === completedMessageId) {
        queue.shift();
      } else {
        const index = queue.indexOf(completedMessageId);
        if (index !== -1) {
          queue.splice(index, 1);
        }
      }
    },
    [],
  );

  const startStreamForMessage = useCallback(
    (userMessageId: string) => {
      if (isStreamingRef.current) {
        return;
      }

      const queue = streamQueueRef.current;
      if (queue.length === 0 || queue[0] !== userMessageId) {
        return;
      }

      const conversationSnapshot = messagesRef.current;
      const targetIndex = conversationSnapshot.findIndex(
        (message) => message.id === userMessageId && message.role === "user",
      );

      if (targetIndex === -1) {
        markQueueAsIdle(userMessageId);
        if (queue.length > 0) {
          const nextId = queue[0];
          if (nextId) {
            startStreamForMessage(nextId);
          }
        }
        return;
      }

      const truncatedSnapshot = conversationSnapshot.slice(0, targetIndex + 1);

      const payloadMessages: AgentMessage[] = truncatedSnapshot
        .filter(
          (message) =>
            message.role !== "assistant" ||
            message.streamState === "complete" ||
            message.streamState === "error" ||
            typeof message.streamState === "undefined",
        )
        .map<AgentMessage>((message) => ({
          id: message.id,
          role: message.role as AgentRole,
          content: message.content,
          metadata: message.metadata,
        }));

      const assistantId = createId("assistant");
      const startedAt = new Date().toISOString();

      isStreamingRef.current = true;
      if (isMountedRef.current) {
        setIsStreaming(true);
        setErrorMessage(null);
      }

      let hasFinished = false;
      let fallbackInvoked = false;
      let streamHandle: AgentStreamHandle | null = null;

      const finishStreaming = () => {
        if (hasFinished) {
          return;
        }
        hasFinished = true;
        markQueueAsIdle(userMessageId);
        isStreamingRef.current = false;
        if (isMountedRef.current) {
          setIsStreaming(false);
        }
        activeStreamRef.current = null;
        if (streamQueueRef.current.length > 0) {
          const nextId = streamQueueRef.current[0];
          if (nextId) {
            startStreamForMessage(nextId);
          }
        }
      };

      const completeAssistantResponse = (assistantMessage?: AgentMessage | null) => {
        applyMessagesUpdate((prev) =>
          prev.map((message) => {
            if (message.id === assistantId) {
              const nextContent =
                typeof assistantMessage?.content === "string" &&
                assistantMessage.content.length > 0
                  ? assistantMessage.content
                  : message.content;
              return {
                ...message,
                content: nextContent,
                streamState: "complete",
                error: null,
                remoteId: assistantMessage?.id ?? message.remoteId,
                metadata:
                  assistantMessage?.metadata &&
                  Object.keys(assistantMessage.metadata).length > 0
                    ? assistantMessage.metadata
                    : message.metadata,
              };
            }
            if (message.id === userMessageId && message.role === "user") {
              return {
                ...message,
                status: "responded",
              };
            }
            return message;
          }),
        );
      };

      const failAssistantResponse = (messageText: string) => {
        if (isMountedRef.current) {
          setErrorMessage(messageText);
        }
        applyMessagesUpdate((prev) =>
          prev.map((message) => {
            if (message.id === assistantId) {
              return {
                ...message,
                streamState: "error",
                error: messageText,
              };
            }
            if (message.id === userMessageId && message.role === "user") {
              return {
                ...message,
                status: "responded",
              };
            }
            return message;
          }),
        );
      };

      const runFallback = async (reason?: unknown) => {
        if (fallbackInvoked) {
          return;
        }
        fallbackInvoked = true;
        streamHandle?.abort();
        try {
          const response = await agentChat({
            sessionId: sessionIdRef.current,
            messages: payloadMessages,
            context: {
              routePath: location.pathname,
            },
          });
          const directMessage = response.message;
          const fallbackMessage =
            directMessage ??
            (Array.isArray(response.messages)
              ? [...response.messages]
                  .reverse()
                  .find((candidate): candidate is AgentMessage => candidate?.role === "assistant")
              : null);
          completeAssistantResponse(fallbackMessage);
          if (isMountedRef.current) {
            setErrorMessage(null);
          }
        } catch (fallbackError) {
          const messageText =
            fallbackError instanceof Error
              ? fallbackError.message
              : extractErrorMessage(reason) ??
                (typeof reason === "string" && reason.length > 0
                  ? reason
                  : undefined) ??
                "We couldn't reach the Storyloop agent.";
          failAssistantResponse(messageText);
        } finally {
          finishStreaming();
        }
      };

      applyMessagesUpdate((prev) =>
        prev
          .map((message) =>
            message.id === userMessageId && message.role === "user"
              ? { ...message, status: "responding" }
              : message,
          )
          .concat({
            id: assistantId,
            role: "assistant",
            content: "",
            createdAt: startedAt,
            streamState: "streaming",
            respondingTo: userMessageId,
            error: null,
          }),
      );

      const handleEvent = (event: AgentStreamEvent) => {
        if (!isMountedRef.current) {
          return;
        }

        if (event.type === "message_start") {
          const remoteId = getRemoteMessageId(event.data);
          if (remoteId) {
            applyMessagesUpdate((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, remoteId }
                  : message,
              ),
            );
          }
          return;
        }

        const textDelta = extractTextDelta(event);
        if (textDelta) {
          applyMessagesUpdate((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + textDelta }
                : message,
            ),
          );
        }

        if (
          event.type === "message_stop" ||
          event.type === "response_completed"
        ) {
          completeAssistantResponse();
        }

        if (event.type === "error") {
          if (fallbackInvoked) {
            return;
          }
          void runFallback(event.data);
        }
      };

      streamHandle = streamAgentChat({
        payload: {
          sessionId: sessionIdRef.current,
          messages: payloadMessages,
          context: {
            routePath: location.pathname,
          },
        },
        onEvent: handleEvent,
      });

      activeStreamRef.current = {
        handle: streamHandle,
        assistantId,
        userMessageId,
      };

      const isAbortError = (error: unknown): boolean =>
        (typeof DOMException !== "undefined" &&
          error instanceof DOMException &&
          error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError");

      streamHandle.closed
        .catch((error) => {
          if (!isMountedRef.current) {
            return;
          }
          if (fallbackInvoked && isAbortError(error)) {
            return;
          }
          if (isAbortError(error)) {
            failAssistantResponse("The agent request was cancelled.");
            finishStreaming();
            return;
          }
          void runFallback(error);
        })
        .finally(() => {
          finishStreaming();
        });
    },
    [applyMessagesUpdate, location.pathname, markQueueAsIdle],
  );

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed.length === 0) {
      return;
    }

    const userMessage: ConversationMessage = {
      id: createId("user"),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    applyMessagesUpdate((prev) => [...prev, userMessage]);
    streamQueueRef.current.push(userMessage.id);

    setInputValue("");
    setErrorMessage(null);

    if (!isStreamingRef.current) {
      const nextId = streamQueueRef.current[0];
      if (nextId) {
        startStreamForMessage(nextId);
      }
    }
  }, [applyMessagesUpdate, inputValue, startStreamForMessage]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      handleSend();
    },
    [handleSend],
  );

  const handleTextareaKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const pendingQueueCount = useMemo(
    () =>
      messages.filter(
        (message) => message.role === "user" && message.status === "pending",
      ).length,
    [messages],
  );

  const sendDisabled = inputValue.trim().length === 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="border-b bg-muted/40">
        <CardTitle className="text-base">Agent Assistant</CardTitle>
        <CardDescription>
          Ask Storyloop&apos;s agent to summarise performance, ideate hooks, or
          draft scripts from your latest activity.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 p-0">
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-6 text-center text-muted-foreground">
              <p className="font-medium text-foreground">
                Start a conversation
              </p>
              <p className="mt-1 text-sm">
                Share what you&apos;re working on and the agent will collaborate
                in real time.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLatestAssistant={message.id === activeStreamRef.current?.assistantId}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        {errorMessage ? (
          <div className="px-6 text-sm text-destructive">{errorMessage}</div>
        ) : null}
        <form
          onSubmit={handleSubmit}
          className="space-y-2 border-t bg-background px-6 py-4"
        >
          <Textarea
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Ask for insight, a summary, or help planning your next upload…"
            rows={3}
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Press ⌘⏎ or Ctrl⏎ to send</span>
              {isStreaming ? (
                <Badge variant="outline">Streaming</Badge>
              ) : pendingQueueCount > 0 ? (
                <Badge variant="outline">
                  {pendingQueueCount} queued
                </Badge>
              ) : null}
            </div>
            <Button type="submit" disabled={sendDisabled}>
              Send
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MessageBubble({
  message,
  isLatestAssistant,
}: {
  message: ConversationMessage;
  isLatestAssistant: boolean;
}) {
  const isUser = message.role === "user";
  const bubbleClasses = cn(
    "max-w-[82%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
    isUser
      ? "ml-auto bg-primary text-primary-foreground"
      : "bg-muted text-foreground",
  );

  const statusLabel = getStatusLabel(message, isLatestAssistant);
  const showStatusLabel = Boolean(statusLabel);

  return (
    <div
      className={cn(
        "flex",
        isUser ? "justify-end text-right" : "justify-start text-left",
      )}
    >
      <div className="space-y-1">
        <div className={bubbleClasses}>
          {message.content.length > 0 ? (
            message.content
          ) : message.streamState === "streaming" ? (
            <span className="text-muted-foreground">Drafting…</span>
          ) : message.streamState === "error" ? (
            <span className="text-destructive">{message.error}</span>
          ) : null}
        </div>
        {showStatusLabel ? (
          <div className="text-[11px] text-muted-foreground">{statusLabel}</div>
        ) : null}
      </div>
    </div>
  );
}

function getStatusLabel(
  message: ConversationMessage,
  isLatestAssistant: boolean,
): string | null {
  if (message.role === "user") {
    if (message.status === "pending") {
      return "Queued";
    }
    if (message.status === "responding") {
      return "Waiting on agent…";
    }
    return null;
  }

  if (message.streamState === "streaming") {
    return isLatestAssistant ? "Agent is drafting a reply…" : "Drafting…";
  }

  if (message.streamState === "error") {
    return message.error ?? "Agent error";
  }

  return null;
}

function extractTextDelta(event: AgentStreamEvent): string | null {
  const data = event.data;
  if (!data) {
    return null;
  }

  if (typeof data === "string") {
    return data;
  }

  if (typeof data !== "object") {
    return null;
  }

  if ("delta" in data && data.delta && typeof data.delta === "object") {
    const delta = data.delta as { text?: unknown; type?: string };
    if (typeof delta.text === "string") {
      return delta.text;
    }
  }

  if ("text" in data && typeof (data as { text?: unknown }).text === "string") {
    return (data as { text: string }).text;
  }

  if (
    "content_block" in data &&
    data.content_block &&
    typeof data.content_block === "object" &&
    "text" in (data.content_block as { text?: unknown }) &&
    typeof (data.content_block as { text?: unknown }).text === "string"
  ) {
    return (data.content_block as { text: string }).text;
  }

  return null;
}

function extractErrorMessage(data: unknown): string | null {
  if (!data) {
    return null;
  }

  if (typeof data === "string") {
    return data;
  }

  if (typeof data !== "object") {
    return null;
  }

  if ("error" in data && typeof (data as { error?: unknown }).error === "string") {
    return (data as { error: string }).error;
  }

  if ("message" in data && typeof (data as { message?: unknown }).message === "string") {
    return (data as { message: string }).message;
  }

  if ("detail" in data && typeof (data as { detail?: unknown }).detail === "string") {
    return (data as { detail: string }).detail;
  }

  return null;
}

function getRemoteMessageId(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as {
    message?: { id?: string };
  };

  return typeof payload.message?.id === "string" ? payload.message.id : null;
}

function createId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}
