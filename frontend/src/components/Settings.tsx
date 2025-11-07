import { useState, useEffect } from "react";
import { isAxiosError } from "axios";

import { youtubeAuthApi, type YoutubeAuthStatusResponse } from "@/api/youtubeAuth";
import { NavBar } from "@/components/NavBar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SettingsProps {
  onNavigateToDashboard?: () => void;
}

export function Settings({ onNavigateToDashboard }: SettingsProps) {
  const [status, setStatus] = useState<YoutubeAuthStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void loadStatus();
  }, []);

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const authStatus = await youtubeAuthApi.getYoutubeAuthStatus();
      setStatus(authStatus);
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const data = err.response?.data as unknown;
        const detail =
          typeof data === "object" &&
          data !== null &&
          "detail" in data &&
          typeof (data as { detail: unknown }).detail === "string"
            ? (data as { detail: string }).detail
            : null;
        setError(detail ?? "Failed to load account status.");
      } else {
        setError("Failed to load account status.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (
      !confirm(
        "Are you sure you want to log out? This will disconnect your YouTube channel.",
      )
    ) {
      return;
    }

    setIsLoggingOut(true);
    setError(null);
    setSuccess(null);

    try {
      await youtubeAuthApi.logoutYoutube();
      setSuccess("Logged out successfully. Your YouTube channel has been disconnected.");
      await loadStatus();
      // Refresh the page to update UI state
      window.location.reload();
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const data = err.response?.data as unknown;
        const detail =
          typeof data === "object" &&
          data !== null &&
          "detail" in data &&
          typeof (data as { detail: unknown }).detail === "string"
            ? (data as { detail: string }).detail
            : null;
        setError(detail ?? "Failed to log out. Please try again.");
      } else {
        setError("Failed to log out. Please try again.");
      }
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = confirm(
      "Are you sure you want to delete your account? This will permanently delete all your data including entries and YouTube connection. This action cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    const doubleConfirmed = confirm(
      "This will delete ALL your data. Are you absolutely sure?",
    );
    if (!doubleConfirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await youtubeAuthApi.deleteUser();
      setSuccess("Account deleted successfully. Redirecting...");
      // Redirect to home after a short delay
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const data = err.response?.data as unknown;
        const detail =
          typeof data === "object" &&
          data !== null &&
          "detail" in data &&
          typeof (data as { detail: unknown }).detail === "string"
            ? (data as { detail: string }).detail
            : null;
        setError(detail ?? "Failed to delete account. Please try again.");
      } else {
        setError("Failed to delete account. Please try again.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 text-foreground">
      <NavBar
        onNavigateToSettings={() => {}}
        onNavigateToDashboard={onNavigateToDashboard}
      />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Settings</CardTitle>
            <CardDescription>
              Manage your account and YouTube connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-2">
                      YouTube Connection
                    </h3>
                    {status?.linked ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {status.channel_thumbnail_url && (
                            <img
                              src={status.channel_thumbnail_url}
                              alt={status.channel_title || "Channel"}
                              className="h-10 w-10 rounded-full"
                            />
                          )}
                          <div>
                            <p className="text-sm font-medium">
                              {status.channel_title || "Connected"}
                            </p>
                            {status.channel_id && (
                              <p className="text-xs text-muted-foreground">
                                {status.channel_id}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleLogout}
                          disabled={isLoggingOut}
                          className="w-full sm:w-auto"
                        >
                          {isLoggingOut ? "Logging out..." : "Disconnect YouTube"}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No YouTube channel connected. Connect your channel from
                        the dashboard.
                      </p>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold mb-2 text-destructive">
                      Danger Zone
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Permanently delete your account and all associated data.
                      This action cannot be undone.
                    </p>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete Account"}
                    </Button>
                  </div>
                </div>

                {error ? (
                  <p className="text-sm text-destructive" role="status">
                    {error}
                  </p>
                ) : null}
                {success ? (
                  <p className="text-sm text-emerald-600" role="status">
                    {success}
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
