import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { youtubeApi, youtubeQueries } from "@/api/youtube";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LinkYouTubeAccountCard() {
  const statusQuery = useQuery(youtubeQueries.authStatus());
  const startLinkMutation = useMutation({
    mutationFn: youtubeApi.startLink,
    onSuccess: (data) => {
      window.open(data.authorizationUrl, "_self");
    },
  });

  const startLinkError = useMemo(() => {
    if (!startLinkMutation.isError) {
      return null;
    }
    const error = startLinkMutation.error;
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return "We couldn't start the link flow. Please try again.";
  }, [startLinkMutation.error, startLinkMutation.isError]);

  const handleLinkClick = useCallback(() => {
    startLinkMutation.reset();
    startLinkMutation.mutate();
  }, [startLinkMutation]);

  const isLinked = statusQuery.data?.linked ?? false;
  const cardClassName = isLinked
    ? undefined
    : "border-dashed border-primary/40 bg-primary/5";

  if (statusQuery.isLoading) {
    return (
      <Card className={cardClassName}>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground" role="status">
            Checking YouTube link status…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (statusQuery.isError) {
    return (
      <Card className={cardClassName}>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm text-destructive" role="alert">
            We couldn't check your YouTube link. Please try again.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void statusQuery.refetch();
            }}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!isLinked) {
    return (
      <Card className={cardClassName}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">
            Connect your YouTube channel
          </CardTitle>
          <CardDescription>
            Link your channel to automatically pull recent uploads into the
            activity feed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-2">
          <Button
            type="button"
            onClick={handleLinkClick}
            disabled={startLinkMutation.isPending}
            className="w-full sm:w-auto"
          >
            {startLinkMutation.isPending ? "Redirecting…" : "Link channel"}
          </Button>
          {startLinkError ? (
            <p className="text-sm text-destructive" role="alert">
              {startLinkError}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const channel = statusQuery.data?.channel ?? null;
  const refreshNeeded = statusQuery.data?.refreshNeeded ?? false;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold text-foreground">
          Connected YouTube channel
        </CardTitle>
        <CardDescription>
          {refreshNeeded
            ? "Your connection may need to be refreshed soon."
            : "We're automatically pulling recent uploads from this channel."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {channel ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {channel.title ?? "Linked channel"}
            </p>
            {channel.url ? (
              <a
                href={channel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                View channel on YouTube
              </a>
            ) : null}
            {channel.updatedAt ? (
              <p className="text-xs text-muted-foreground">
                Last synced {new Date(channel.updatedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your channel is linked. We'll show new uploads here automatically.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

