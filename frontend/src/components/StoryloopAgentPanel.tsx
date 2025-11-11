import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { chatkitApi } from "@/api/chatkit";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function isChatKitDefined() {
  return (
    typeof window !== "undefined" &&
    typeof window.customElements !== "undefined" &&
    window.customElements.get("openai-chatkit") !== undefined
  );
}

export function StoryloopAgentPanel() {
  const [isComponentReady, setIsComponentReady] = useState(
    () => isChatKitDefined(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isComponentReady) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const interval = window.setInterval(() => {
      if (isChatKitDefined()) {
        setIsComponentReady(true);
        window.clearInterval(interval);
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, [isComponentReady]);

  const getClientSecret = useCallback(async (currentSecret: string | null) => {
    if (currentSecret) {
      return currentSecret;
    }
    setIsLoading(true);
    setError(null);
    try {
      const session = await chatkitApi.createChatkitSession();
      return session.clientSecret;
    } catch (thrownError) {
      const message =
        thrownError instanceof Error
          ? thrownError.message
          : "We couldn't start the Storyloop Agent.";
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const chatKitOptions = useMemo(
    () => ({
      api: { getClientSecret },
      theme: { colorScheme: "light" as const },
      header: {
        title: {
          text: "Storyloop Agent",
        },
      },
      startScreen: {
        greeting: "How can I help accelerate your YouTube storytelling today?",
      },
    }),
    [getClientSecret],
  );

  const { control, ref } = useChatKit(chatKitOptions);

  return (
    <Card className="h-full min-h-[28rem]">
      <CardHeader>
        <CardTitle>Storyloop Agent</CardTitle>
        <CardDescription>
          Ask questions about your content performance and next best actions.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4">
        {error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <div className="relative flex-1 overflow-hidden rounded-lg border bg-background">
          {!isComponentReady ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading agent…
            </div>
          ) : (
            <ChatKit
              ref={ref}
              control={control}
              className="h-full min-h-[24rem] w-full"
            />
          )}
          {isLoading ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-end bg-gradient-to-t from-transparent via-transparent to-background/40 p-3 text-xs text-muted-foreground">
              Connecting…
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

