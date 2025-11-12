import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { useState } from "react";
import { createChatKitSession } from "@/api/chatkit";

export function ChatKitPanel() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { control } = useChatKit({
    api: {
      getClientSecret: async (currentClientSecret) => {
        if (!currentClientSecret) {
          try {
            setIsLoading(true);
            setError(null);
            const session = await createChatKitSession();
            return session.client_secret;
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : "Failed to create ChatKit session";
            setError(message);
            throw err;
          } finally {
            setIsLoading(false);
          }
        }
        // Return existing secret if available
        return currentClientSecret;
      },
    },
  });

  if (error) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Failed to load ChatKit: {error}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Loading ChatKit...</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ChatKit control={control} className="h-full w-full" />
    </div>
  );
}

