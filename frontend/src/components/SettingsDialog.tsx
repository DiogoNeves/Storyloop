import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookPen, UserRound } from "lucide-react";

import { youtubeApi, youtubeQueries } from "@/api/youtube";
import { useSettings } from "@/context/useSettings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsTab = "account" | "journal";

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const { publicOnly, setPublicOnly } = useSettings();

  const linkStatusQuery = useQuery(youtubeQueries.authStatus());

  const unlinkMutation = useMutation({
    mutationFn: youtubeApi.unlinkAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: youtubeQueries.authStatus().queryKey });
      void queryClient.invalidateQueries({ queryKey: ["youtube"] });
    },
  });

  const tabs = useMemo(
    () => [
      { key: "account", label: "Account", icon: UserRound },
      { key: "journal", label: "Journal", icon: NotebookPen },
    ] satisfies { key: SettingsTab; label: string; icon: typeof UserRound }[],
    [],
  );

  const channel = linkStatusQuery.data?.channel;
  const isLinked = Boolean(linkStatusQuery.data?.linked);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] min-h-[520px] gap-0 overflow-hidden p-0">
        <div className="grid h-full grid-cols-1 gap-0 md:grid-cols-[220px_1fr]">
          <div className="border-b border-r bg-muted/50 md:border-b-0">
            <DialogHeader className="px-6 py-4">
              <DialogTitle className="text-lg font-semibold">Settings</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Manage your account and journal preferences.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1 px-2 py-3">
              {tabs.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-4 py-2 text-left text-sm font-medium transition",
                    "hover:bg-muted",
                    activeTab === key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6 overflow-y-auto p-6">
            {activeTab === "account" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">YouTube account</h3>
                  <p className="text-sm text-muted-foreground">
                    Control how Storyloop connects to your YouTube channel.
                  </p>
                </div>

                <div className="flex items-start justify-between rounded-lg border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {isLinked
                        ? channel?.title ?? "Linked YouTube channel"
                        : "No channel linked"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isLinked
                        ? "You can disconnect your Google account from Storyloop."
                        : "Connect a YouTube channel to personalize your feed."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={isLinked ? "destructive" : "secondary"}
                    onClick={() => unlinkMutation.mutate()}
                    disabled={unlinkMutation.isPending || !isLinked}
                  >
                    {unlinkMutation.isPending
                      ? "Unlinking…"
                      : isLinked
                        ? "Unlink account"
                        : "Not linked"}
                  </Button>
                </div>
              </div>
            ) : null}

            {activeTab === "journal" ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">Journal preferences</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure how entries and content appear in your journal.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    View
                  </h4>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Show public uploads only</p>
                      <p className="text-sm text-muted-foreground">
                        Hide unlisted or private YouTube videos when browsing your feed.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="settings-public-only" className="sr-only">
                        Public only
                      </Label>
                      <Switch
                        id="settings-public-only"
                        checked={publicOnly}
                        onCheckedChange={setPublicOnly}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
