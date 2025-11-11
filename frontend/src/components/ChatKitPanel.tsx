import { useCallback, useEffect, useMemo, useState } from "react";

import { ChatKit, useChatKit } from "@openai/chatkit-react";

import { requestChatKitSession } from "@/api/chatkit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CHATKIT_SCRIPT_URL = "https://cdn.platform.openai.com/deployments/chatkit/chatkit.js";

type ScriptStatus = "idle" | "loading" | "ready" | "error";

function useChatKitScript(): ScriptStatus {
  const [status, setStatus] = useState<ScriptStatus>(() => {
    if (typeof window === "undefined") {
      return "loading";
    }
    return window.customElements?.get("openai-chatkit") ? "ready" : "idle";
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.customElements?.get("openai-chatkit")) {
      setStatus("ready");
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-storyloop-chatkit-script]",
    );

    let script = existing;
    let cancelled = false;

    const handleReady = () => {
      window.customElements
        ?.whenDefined("openai-chatkit")
        .then(() => {
          if (!cancelled) {
            setStatus("ready");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setStatus("error");
          }
        });
    };

    const handleError = () => {
      if (!cancelled) {
        setStatus("error");
      }
    };

    if (!script) {
      script = document.createElement("script");
      script.src = CHATKIT_SCRIPT_URL;
      script.async = true;
      script.dataset.storyloopChatkitScript = "true";
      script.addEventListener("load", handleReady);
      script.addEventListener("error", handleError);
      document.head.appendChild(script);
      setStatus("loading");
    } else {
      script.addEventListener("load", handleReady);
      script.addEventListener("error", handleError);
      setStatus("loading");
    }

    return () => {
      cancelled = true;
      script?.removeEventListener("load", handleReady);
      script?.removeEventListener("error", handleError);
    };
  }, []);

  return status;
}

interface ChatKitPanelProps {
  className?: string;
}

export function ChatKitPanel({ className }: ChatKitPanelProps) {
  const scriptStatus = useChatKitScript();
  const [sessionError, setSessionError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    const session = await requestChatKitSession();
    setSessionError(null);
    return session.clientSecret;
  }, []);

  const chatKitOptions = useMemo(
    () => ({
      api: {
        async getClientSecret() {
          try {
            return await fetchClientSecret();
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to start the chat.";
            setSessionError(message);
            throw error;
          }
        },
      },
      theme: { colorScheme: "dark" as const },
      header: {
        title: { text: "Storyloop Copilot" },
      },
      startScreen: {
        greeting: "How can I support your channel today?",
        prompts: [
          { label: "Review my latest video", prompt: "Review my latest video performance." },
          { label: "Brainstorm ideas", prompt: "Brainstorm three new video ideas." },
        ],
      },
    }),
    [fetchClientSecret],
  );

  const chatKit = useChatKit(chatKitOptions);

  const renderBody = () => {
    if (scriptStatus === "error") {
      return (
        <p className="text-sm text-destructive">
          We couldn't load ChatKit. Check your network connection and refresh.
        </p>
      );
    }

    if (sessionError) {
      return <p className="text-sm text-destructive">{sessionError}</p>;
    }

    if (scriptStatus !== "ready") {
      return <p className="text-sm text-muted-foreground">Preparing the assistant…</p>;
    }

    return <ChatKit control={chatKit.control} className="h-[600px] w-full" />;
  };

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader>
        <CardTitle>Storyloop Copilot</CardTitle>
        <CardDescription>
          Chat with an AI teammate about growth, publishing cadence, and YouTube strategy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {renderBody()}
      </CardContent>
    </Card>
  );
}
