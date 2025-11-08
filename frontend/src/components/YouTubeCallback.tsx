import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { youtubeApi, youtubeQueries } from "@/api/youtube";

export function YouTubeCallback() {
  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasHandledRef = useRef(false);

  useEffect(() => {
    if (hasHandledRef.current) {
      return;
    }
    hasHandledRef.current = true;

    const handleCallback = async () => {
      // Extract code, state, and error from URL query parameters
      const error = searchParams.get("error");
      const code = searchParams.get("code");
      const state = searchParams.get("state");

      // Check if Google returned an error (e.g., user denied access)
      if (error) {
        setStatus("error");
        const errorDescription = searchParams.get("error_description");
        setErrorMessage(
          errorDescription ||
            "Authorization was denied or cancelled. Please try again.",
        );
        return;
      }

      if (!code || !state) {
        setStatus("error");
        setErrorMessage("Missing authorization code or state parameter.");
        return;
      }

      try {
        await youtubeApi.completeCallback({ code, state });
        setStatus("success");

        // Invalidate auth status query to refetch updated state
        await queryClient.invalidateQueries({
          queryKey: youtubeQueries.authStatus().queryKey,
        });

        // Redirect to homepage after a brief delay
        setTimeout(() => {
          navigate("/", { replace: true });
        }, 1500);
      } catch (error) {
        setStatus("error");
        const message =
          error instanceof Error
            ? error.message
            : "Failed to complete YouTube account linking.";
        setErrorMessage(message);
      }
    };

    void handleCallback();
  }, [queryClient, navigate, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20">
      <div className="mx-auto w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-sm">
        {status === "processing" && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <h1 className="text-lg font-semibold">
                Completing YouTube account linking...
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Please wait while we finish setting up your account connection.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                <svg
                  className="h-3 w-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 className="text-lg font-semibold">
                Account linked successfully!
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Redirecting you back to the homepage...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive">
                <svg
                  className="h-3 w-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-destructive">
                Failed to link account
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <div className="pt-4">
              <a
                href="/"
                className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Return to homepage
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
