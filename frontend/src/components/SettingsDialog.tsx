import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleHelp,
  ListTodo,
  NotebookPen,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";

import {
  type AccentPreference,
  DEFAULT_SMART_UPDATE_SCHEDULE_HOURS,
  settingsQueries,
  updateSettings,
  type ActivityFeedSortDate,
} from "@/api/settings";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusMessage } from "@/components/ui/status-message";
import { cn } from "@/lib/utils";
import { ActivityFeedInfo } from "@/components/ActivityFeedInfo";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsTab = "account" | "general" | "journal" | "today" | "help";
interface AccentOption {
  value: AccentPreference;
  label: string;
  swatch: string;
}

const ACCENT_OPTIONS: AccentOption[] = [
  { value: "crimson", label: "Crimson", swatch: "hsl(0 84.2% 60.2%)" },
  { value: "rose", label: "Rose", swatch: "hsl(345 84.2% 60.2%)" },
  { value: "emerald", label: "Emerald", swatch: "hsl(145 84.2% 60.2%)" },
  { value: "azure", label: "Azure", swatch: "hsl(215 84.2% 60.2%)" },
  { value: "violet", label: "Violet", swatch: "hsl(270 84.2% 60.2%)" },
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const {
    publicOnly,
    setPublicOnly,
    themePreference,
    setThemePreference,
    accentPreference,
    setAccentPreference,
    isAccentUpdating,
    accentUpdateError,
  } = useSettings();
  const [scheduleInput, setScheduleInput] = useState(
    String(DEFAULT_SMART_UPDATE_SCHEDULE_HOURS),
  );
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const linkStatusQuery = useQuery(youtubeQueries.authStatus());
  const settingsQuery = useQuery(settingsQueries.all());

  const scheduleHours =
    settingsQuery.data?.smartUpdateScheduleHours ??
    DEFAULT_SMART_UPDATE_SCHEDULE_HOURS;
  const showArchived = settingsQuery.data?.showArchived ?? false;
  const activityFeedSortDate =
    settingsQuery.data?.activityFeedSortDate ?? "created";
  const todayEntriesEnabled = settingsQuery.data?.todayEntriesEnabled ?? true;
  const todayIncludePreviousIncomplete =
    settingsQuery.data?.todayIncludePreviousIncomplete ?? true;
  const todayMoveCompletedToEnd =
    settingsQuery.data?.todayMoveCompletedToEnd ?? true;

  useEffect(() => {
    setScheduleInput(String(scheduleHours));
  }, [scheduleHours]);

  const unlinkMutation = useMutation({
    mutationFn: youtubeApi.unlinkAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: youtubeQueries.authStatus().queryKey });
      void queryClient.invalidateQueries({ queryKey: ["youtube"] });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(settingsQueries.all().queryKey, data);
      setScheduleError(null);
    },
    onError: () => {
      setScheduleError("We couldn't update the smart update schedule. Try again.");
    },
  });

  const commitSchedule = useCallback(() => {
    if (scheduleMutation.isPending || isAccentUpdating) {
      return;
    }

    const parsed = Number(scheduleInput);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
      setScheduleError("Enter a whole number of hours (1 or more).");
      return;
    }

    const nextHours = Math.trunc(parsed);
    setScheduleInput(String(nextHours));
    setScheduleError(null);

    if (nextHours === scheduleHours) {
      return;
    }

    scheduleMutation.mutate({ smartUpdateScheduleHours: nextHours });
  }, [isAccentUpdating, scheduleHours, scheduleInput, scheduleMutation]);

  const handleScheduleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setScheduleInput(event.target.value);
      setScheduleError(null);
    },
    [],
  );

  const handleScheduleBlur = useCallback(() => {
    commitSchedule();
  }, [commitSchedule]);

  const handleScheduleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitSchedule();
      }
    },
    [commitSchedule],
  );

  const tabs = useMemo(
    () => [
      { key: "account", label: "Account", icon: UserRound },
      { key: "general", label: "General", icon: SlidersHorizontal },
      { key: "journal", label: "Journal", icon: NotebookPen },
      { key: "today", label: "Today", icon: ListTodo },
      { key: "help", label: "Help", icon: CircleHelp },
    ] satisfies { key: SettingsTab; label: string; icon: typeof UserRound }[],
    [],
  );

  const channel = linkStatusQuery.data?.channel;
  const isLinked = Boolean(linkStatusQuery.data?.linked);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[85dvh] max-h-[85dvh] w-[calc(100vw-1rem)] max-w-4xl gap-0 overflow-hidden p-0 md:h-auto md:max-h-[85vh] md:min-h-[520px]">
        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_1fr] gap-0 md:grid-cols-[220px_1fr] md:grid-rows-1">
          <div className="flex min-h-0 flex-col border-b border-r bg-muted/50 md:border-b-0">
            <DialogHeader className="px-6 py-4">
              <DialogTitle className="text-lg font-semibold">Settings</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Manage account, general, journal, and help preferences.
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

          <div className="min-h-0 space-y-6 overflow-y-auto overscroll-contain p-6 [-webkit-overflow-scrolling:touch]">
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
                  <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Activity feed date sort</p>
                      <p className="text-sm text-muted-foreground">
                        Choose whether journal entries sort by creation date or last modified date.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="settings-activity-feed-sort-date" className="sr-only">
                        Activity feed date sort
                      </Label>
                      <Select
                        value={activityFeedSortDate}
                        onValueChange={(value) => {
                          scheduleMutation.mutate({
                            activityFeedSortDate: value as ActivityFeedSortDate,
                          });
                        }}
                        disabled={
                          settingsQuery.isLoading ||
                          scheduleMutation.isPending ||
                          isAccentUpdating
                        }
                      >
                        <SelectTrigger id="settings-activity-feed-sort-date" className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="created">Created date</SelectItem>
                          <SelectItem value="modified">Modified date</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Show archived journals</p>
                      <p className="text-sm text-muted-foreground">
                        Include archived journal entries in your activity feed.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="settings-show-archived" className="sr-only">
                        Show archived journals
                      </Label>
                      <Switch
                        id="settings-show-archived"
                        checked={showArchived}
                        disabled={
                          settingsQuery.isLoading ||
                          scheduleMutation.isPending ||
                          isAccentUpdating
                        }
                        onCheckedChange={(checked) => {
                          scheduleMutation.mutate({ showArchived: checked });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Smart updates
                  </h4>
                  <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Update schedule</p>
                      <p className="text-sm text-muted-foreground">
                        Choose how often Loopie refreshes smart journals (checked hourly).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="settings-smart-update-schedule" className="sr-only">
                        Smart update schedule in hours
                      </Label>
                      <Input
                        id="settings-smart-update-schedule"
                        type="number"
                        min={1}
                        step={1}
                        className="w-24 text-right"
                        value={scheduleInput}
                        onChange={handleScheduleChange}
                        onBlur={handleScheduleBlur}
                        onKeyDown={handleScheduleKeyDown}
                        disabled={
                          scheduleMutation.isPending ||
                          settingsQuery.isLoading ||
                          isAccentUpdating
                        }
                        inputMode="numeric"
                      />
                      <span className="text-xs text-muted-foreground">hours</span>
                    </div>
                  </div>
                  <StatusMessage type="error" message={scheduleError} />
                </div>
              </div>
            ) : null}

            {activeTab === "general" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">General settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure app-wide display and interface preferences.
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Theme</p>
                    <p className="text-sm text-muted-foreground">
                      Choose your preferred color scheme for the interface.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="settings-theme" className="sr-only">
                      Theme preference
                    </Label>
                    <Select
                      value={themePreference}
                      onValueChange={(value) =>
                        setThemePreference(value as "light" | "dark" | "system")
                      }
                    >
                      <SelectTrigger id="settings-theme" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Accent color</p>
                      <p className="text-sm text-muted-foreground">
                        Pick the interface accent used for highlights and actions.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="settings-accent-color" className="sr-only">
                        Accent color
                      </Label>
                      <Select
                        disabled={
                          isAccentUpdating ||
                          scheduleMutation.isPending ||
                          settingsQuery.isLoading
                        }
                        value={accentPreference}
                        onValueChange={(value) =>
                          setAccentPreference(value as AccentPreference)
                        }
                      >
                        <SelectTrigger id="settings-accent-color" className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCENT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: option.swatch }}
                                  aria-hidden="true"
                                />
                                {option.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <StatusMessage type="error" message={accentUpdateError} />
                </div>
              </div>
            ) : null}

            {activeTab === "today" ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">Today checklist</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure daily Today entries and checklist rollover behavior.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Enable Today entries</p>
                      <p className="text-sm text-muted-foreground">
                        Create one Today checklist entry each UTC day.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="settings-today-enabled" className="sr-only">
                        Enable Today entries
                      </Label>
                      <Switch
                        id="settings-today-enabled"
                        checked={todayEntriesEnabled}
                        disabled={
                          settingsQuery.isLoading ||
                          scheduleMutation.isPending ||
                          isAccentUpdating
                        }
                        onCheckedChange={(checked) => {
                          scheduleMutation.mutate({ todayEntriesEnabled: checked });
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        Include previous incomplete tasks
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Start each new Today entry with unfinished tasks from yesterday.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor="settings-today-include-previous"
                        className="sr-only"
                      >
                        Include previous incomplete tasks
                      </Label>
                      <Switch
                        id="settings-today-include-previous"
                        checked={todayIncludePreviousIncomplete}
                        disabled={
                          settingsQuery.isLoading ||
                          scheduleMutation.isPending ||
                          isAccentUpdating ||
                          !todayEntriesEnabled
                        }
                        onCheckedChange={(checked) => {
                          scheduleMutation.mutate({
                            todayIncludePreviousIncomplete: checked,
                          });
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        Move completed tasks to end
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Reorder checked tasks to the bottom as you complete them.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor="settings-today-move-completed-to-end"
                        className="sr-only"
                      >
                        Move completed tasks to end
                      </Label>
                      <Switch
                        id="settings-today-move-completed-to-end"
                        checked={todayMoveCompletedToEnd}
                        disabled={
                          settingsQuery.isLoading ||
                          scheduleMutation.isPending ||
                          isAccentUpdating ||
                          !todayEntriesEnabled
                        }
                        onCheckedChange={(checked) => {
                          scheduleMutation.mutate({
                            todayMoveCompletedToEnd: checked,
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "help" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">Help</h3>
                  <p className="text-sm text-muted-foreground">
                    Guidance for understanding and using your activity feed.
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <ActivityFeedInfo />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
