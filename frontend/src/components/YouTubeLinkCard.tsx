import { useEffect, useState } from "react";
import { isAxiosError } from "axios";

import { youtubeAuthApi, type YoutubeAuthStatusResponse } from "@/api/youtubeAuth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface YouTubeLinkCardProps {
  onLinked?: () => void;
}

export function YouTubeLinkCard({ onLinked }: YouTubeLinkCardProps) {
  const [status, setStatus] = useState<YoutubeAuthStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    void checkStatus();
  }, []);

  // Check for auth success in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("youtube_auth") === "success") {
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
      // Refresh status
      void checkStatus();
      onLinked?.();
    }
  }, [onLinked]);

  const checkStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const authStatus = await youtubeAuthApi.getYoutubeAuthStatus();
      setStatus(authStatus);
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data as unknown;
        const detail =
          typeof data === "object" &&
          data !== null &&
          "detail" in data &&
          typeof (data as { detail: unknown }).detail === "string"
            ? (data as { detail: string }).detail
            : null;
        setError(detail ?? "Failed to check YouTube connection status.");
      } else {
        setError("Failed to check YouTube connection status.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartAuth = async () => {
    setIsLinking(true);
    setError(null);
    try {
      const frontendUrl = window.location.origin;
      const { authorization_url } = await youtubeAuthApi.startYoutubeAuth(
        frontendUrl,
      );
      // Redirect to Google OAuth
      window.location.href = authorization_url;
    } catch (err: unknown) {
      setIsLinking(false);
      if (isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data as unknown;
        const detail =
          typeof data === "object" &&
          data !== null &&
          "detail" in data &&
          typeof (data as { detail: unknown }).detail === "string"
            ? (data as { detail: string }).detail
            : null;
        if (status === 503) {
          setError(
            detail ??
              "YouTube OAuth is not configured. Please configure client ID and secret.",
          );
        } else {
          setError(detail ?? "Failed to start YouTube authentication.");
        }
      } else {
        setError("Failed to start YouTube authentication.");
      }
    }
  };

  if (isLoading) {
    return (
      <Card className="border-dashed border-primary/40 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Checking connection...</p>
        </CardContent>
      </Card>
    );
  }

  if (status?.linked) {
    return (
      <Card className="border-dashed border-primary/40 bg-primary/5">
        <CardContent className="space-y-3 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              YouTube channel connected
            </h3>
            <p className="text-xs text-muted-foreground">
              Your channel is linked and ready to use.
            </p>
          </div>
          {status.channel_title && (
            <div className="flex items-center gap-2">
              {status.channel_thumbnail_url && (
                <img
                  src={status.channel_thumbnail_url}
                  alt={status.channel_title}
                  className="h-8 w-8 rounded-full"
                />
              )}
              <div>
                <p className="text-sm font-medium">{status.channel_title}</p>
                {status.channel_id && (
                  <p className="text-xs text-muted-foreground">
                    {status.channel_id}
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed border-primary/40 bg-primary/5">
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            Connect your YouTube channel
          </h3>
          <p className="text-xs text-muted-foreground">
            Link your YouTube channel to automatically sync your videos and
            activity.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleStartAuth}
          disabled={isLinking}
          className="w-full sm:w-auto"
        >
          {isLinking ? "Redirecting..." : "Connect YouTube"}
        </Button>
        {error ? (
          <p className="text-sm text-destructive" role="status">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
