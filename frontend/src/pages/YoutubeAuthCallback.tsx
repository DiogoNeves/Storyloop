import { useEffect, useState, type JSX } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { youtubeApi, youtubeQueries } from "@/api/youtube";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function YoutubeAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<
    "processing" | "success" | "error" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setStatus("error");
      setErrorMessage("Missing authorization code or state parameter.");
      return;
    }

    setStatus("processing");

    youtubeApi
      .completeLink({ code, state })
      .then(() => {
        setStatus("success");
        // Invalidate and refetch auth status
        void queryClient.invalidateQueries({
          queryKey: youtubeQueries.authStatus().queryKey,
        });
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          void navigate("/");
        }, 2000);
      })
      .catch((error) => {
        setStatus("error");
        let message =
          "Failed to complete YouTube authorization. Please try again.";
        if (error && typeof error === "object" && "response" in error) {
          const axiosError = error as {
            response?: { data?: { detail?: string } };
          };
          if (axiosError.response?.data?.detail) {
            message = axiosError.response.data.detail;
          } else if (axiosError.response?.data) {
            message = JSON.stringify(axiosError.response.data);
          }
        } else if (error instanceof Error) {
          message = error.message;
        }
        setErrorMessage(message);
      });
  }, [searchParams, navigate, queryClient]);

  let cardContent: JSX.Element;

  if (status === null || status === "processing") {
    cardContent = (
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground" role="status">
              Completing YouTube authorization…
            </p>
          </div>
        </CardContent>
      </Card>
    );
  } else if (status === "success") {
    cardContent = (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorization successful</CardTitle>
          <CardDescription>
            Your YouTube channel has been linked successfully.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Redirecting to dashboard…
          </p>
          <Button
            type="button"
            onClick={() => {
              void navigate("/");
            }}
            className="w-full"
          >
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  } else {
    cardContent = (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorization failed</CardTitle>
          <CardDescription>
            We couldn't complete the YouTube authorization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              void navigate("/");
            }}
            className="w-full"
          >
            Return to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col">
      <div className="flex min-h-[60vh] items-center justify-center py-12">
        {cardContent}
      </div>
    </div>
  );
}
