import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleHelp,
  ListTodo,
  NotebookPen,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import {
  type AccentPreference,
  type ActivityFeedSortDate,
  DEFAULT_SMART_UPDATE_SCHEDULE_HOURS,
  exportContentArchive,
  resolveSettingsResponse,
  settingsQueries,
  updateSettings,
  type UpdateSettingsInput,
} from "@/api/settings";
import { youtubeApi, youtubeQueries } from "@/api/youtube";
import { ActivityFeedInfo } from "@/components/ActivityFeedInfo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusMessage } from "@/components/ui/status-message";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/context/useSettings";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsTab = "account" | "general" | "journal" | "today" | "help";

interface SettingsTabItem {
  key: SettingsTab;
  label: string;
  icon: LucideIcon;
}

interface AccentOption {
  value: AccentPreference;
  label: string;
  swatch: string;
}

const SETTINGS_TABS: SettingsTabItem[] = [
  { key: "account", label: "Account", icon: UserRound },
  { key: "general", label: "General", icon: SlidersHorizontal },
  { key: "journal", label: "Journal", icon: NotebookPen },
  { key: "today", label: "Today", icon: ListTodo },
  { key: "help", label: "Help", icon: CircleHelp },
];

const ACCENT_OPTIONS: AccentOption[] = [
  { value: "crimson", label: "Crimson", swatch: "hsl(0 84.2% 60.2%)" },
  { value: "rose", label: "Rose", swatch: "hsl(345 84.2% 60.2%)" },
  { value: "emerald", label: "Emerald", swatch: "hsl(145 84.2% 60.2%)" },
  { value: "azure", label: "Azure", swatch: "hsl(215 84.2% 60.2%)" },
  { value: "violet", label: "Violet", swatch: "hsl(270 84.2% 60.2%)" },
];

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  return (
    <div className="flex min-h-0 flex-col border-b border-r bg-muted/50 md:border-b-0">
      <DialogHeader className="px-6 py-4">
        <DialogTitle className="text-lg font-semibold">Settings</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Manage account, general, journal, and help preferences.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1 px-2 py-3">
        {SETTINGS_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
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
  );
}

interface SettingsTabHeaderProps {
  title: string;
  description: string;
}

function SettingsTabHeader({ title, description }: SettingsTabHeaderProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

interface SettingsRowProps {
  title: ReactNode;
  description: string;
  controls: ReactNode;
  layout?: "inline" | "stack" | "start";
  className?: string;
}

function SettingsRow({
  title,
  description,
  controls,
  layout = "inline",
  className,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/50 p-4",
        layout === "inline" && "flex items-center justify-between",
        layout === "stack" &&
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        layout === "start" && "flex items-start justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {controls}
    </div>
  );
}

interface AccountTabContentProps {
  channelTitle: string;
  isLinked: boolean;
  isUnlinking: boolean;
  isExporting: boolean;
  exportError: string | null;
  onUnlink: () => void;
  onExport: () => void;
}

function AccountTabContent({
  channelTitle,
  isLinked,
  isUnlinking,
  isExporting,
  exportError,
  onUnlink,
  onExport,
}: AccountTabContentProps) {
  return (
    <div className="space-y-6">
      <SettingsTabHeader
        title="YouTube account"
        description="Control how Storyloop connects to your YouTube channel."
      />
      <SettingsRow
        layout="start"
        className="bg-transparent"
        title={isLinked ? channelTitle : "No channel linked"}
        description={
          isLinked
            ? "You can disconnect your Google account from Storyloop."
            : "Connect a YouTube channel to personalize your feed."
        }
        controls={
          <Button
            type="button"
            variant={isLinked ? "destructive" : "secondary"}
            onClick={onUnlink}
            disabled={isUnlinking || !isLinked}
          >
            {isUnlinking ? "Unlinking…" : isLinked ? "Unlink account" : "Not linked"}
          </Button>
        }
      />

      <div className="space-y-2">
        <SettingsTabHeader
          title="Export content"
          description="Download your journals, Today entries, and conversations as Obsidian-friendly markdown notes."
        />
        <SettingsRow
          layout="start"
          className="bg-transparent"
          title="Export your data"
          description="Create a zip archive with one markdown note per item."
          controls={
            <Button
              type="button"
              variant="secondary"
              onClick={onExport}
              disabled={isExporting}
            >
              {isExporting ? "Exporting…" : "Export data"}
            </Button>
          }
        />
        <StatusMessage type="error" message={exportError} />
      </div>
    </div>
  );
}

interface JournalTabContentProps {
  publicOnly: boolean;
  setPublicOnly: (value: boolean) => void;
  activityFeedSortDate: ActivityFeedSortDate;
  showArchived: boolean;
  scheduleInput: string;
  scheduleError: string | null;
  isServerSettingsDisabled: boolean;
  onUpdateSetting: (patch: UpdateSettingsInput) => void;
  onScheduleChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onScheduleBlur: () => void;
  onScheduleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

function JournalTabContent({
  publicOnly,
  setPublicOnly,
  activityFeedSortDate,
  showArchived,
  scheduleInput,
  scheduleError,
  isServerSettingsDisabled,
  onUpdateSetting,
  onScheduleChange,
  onScheduleBlur,
  onScheduleKeyDown,
}: JournalTabContentProps) {
  return (
    <div className="space-y-6">
      <SettingsTabHeader
        title="Journal preferences"
        description="Configure how entries and content appear in your journal."
      />

      <div className="space-y-3">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          View
        </h4>

        <SettingsRow
          title="Show public uploads only"
          description="Hide unlisted or private YouTube videos when browsing your feed."
          controls={
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
          }
        />

        <SettingsRow
          layout="stack"
          title="Activity feed date sort"
          description="Choose whether journal entries sort by creation date or last modified date."
          controls={
            <div className="flex items-center gap-2">
              <Label htmlFor="settings-activity-feed-sort-date" className="sr-only">
                Activity feed date sort
              </Label>
              <Select
                value={activityFeedSortDate}
                onValueChange={(value) => {
                  onUpdateSetting({
                    activityFeedSortDate: value as ActivityFeedSortDate,
                  });
                }}
                disabled={isServerSettingsDisabled}
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
          }
        />

        <SettingsRow
          title="Show archived journals"
          description="Include archived journal entries in your activity feed."
          controls={
            <div className="flex items-center gap-2">
              <Label htmlFor="settings-show-archived" className="sr-only">
                Show archived journals
              </Label>
              <Switch
                id="settings-show-archived"
                checked={showArchived}
                disabled={isServerSettingsDisabled}
                onCheckedChange={(checked) => {
                  onUpdateSetting({ showArchived: checked });
                }}
              />
            </div>
          }
        />
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Smart updates
        </h4>

        <SettingsRow
          layout="stack"
          title="Update schedule"
          description="Choose how often Loopie refreshes smart journals (checked hourly)."
          controls={
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
                onChange={onScheduleChange}
                onBlur={onScheduleBlur}
                onKeyDown={onScheduleKeyDown}
                disabled={isServerSettingsDisabled}
                inputMode="numeric"
              />
              <span className="text-xs text-muted-foreground">hours</span>
            </div>
          }
        />
        <StatusMessage type="error" message={scheduleError} />
      </div>
    </div>
  );
}

interface GeneralTabContentProps {
  themePreference: "light" | "dark" | "system";
  setThemePreference: (value: "light" | "dark" | "system") => void;
  accentPreference: AccentPreference;
  setAccentPreference: (value: AccentPreference) => void;
  accentUpdateError: string | null;
  isAccentDisabled: boolean;
}

function GeneralTabContent({
  themePreference,
  setThemePreference,
  accentPreference,
  setAccentPreference,
  accentUpdateError,
  isAccentDisabled,
}: GeneralTabContentProps) {
  return (
    <div className="space-y-4">
      <SettingsTabHeader
        title="General settings"
        description="Configure app-wide display and interface preferences."
      />

      <SettingsRow
        title="Theme"
        description="Choose your preferred color scheme for the interface."
        controls={
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
        }
      />

      <div className="space-y-2">
        <SettingsRow
          title="Accent color"
          description="Pick the interface accent used for highlights and actions."
          controls={
            <div className="flex items-center gap-2">
              <Label htmlFor="settings-accent-color" className="sr-only">
                Accent color
              </Label>
              <Select
                disabled={isAccentDisabled}
                value={accentPreference}
                onValueChange={(value) => setAccentPreference(value as AccentPreference)}
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
          }
        />
        <StatusMessage type="error" message={accentUpdateError} />
      </div>
    </div>
  );
}

interface TodayTabContentProps {
  todayEntriesEnabled: boolean;
  todayIncludePreviousIncomplete: boolean;
  todayMoveCompletedToEnd: boolean;
  isServerSettingsDisabled: boolean;
  onUpdateSetting: (patch: UpdateSettingsInput) => void;
}

function TodayTabContent({
  todayEntriesEnabled,
  todayIncludePreviousIncomplete,
  todayMoveCompletedToEnd,
  isServerSettingsDisabled,
  onUpdateSetting,
}: TodayTabContentProps) {
  return (
    <div className="space-y-6">
      <SettingsTabHeader
        title="Today checklist"
        description="Configure daily Today entries and checklist rollover behavior."
      />

      <div className="space-y-3">
        <SettingsRow
          title="Enable Today entries"
          description="Create one Today checklist entry each UTC day."
          controls={
            <div className="flex items-center gap-2">
              <Label htmlFor="settings-today-enabled" className="sr-only">
                Enable Today entries
              </Label>
              <Switch
                id="settings-today-enabled"
                checked={todayEntriesEnabled}
                disabled={isServerSettingsDisabled}
                onCheckedChange={(checked) => {
                  onUpdateSetting({ todayEntriesEnabled: checked });
                }}
              />
            </div>
          }
        />

        <SettingsRow
          title="Include previous incomplete tasks"
          description="Start each new Today entry with unfinished tasks from yesterday."
          controls={
            <div className="flex items-center gap-2">
              <Label htmlFor="settings-today-include-previous" className="sr-only">
                Include previous incomplete tasks
              </Label>
              <Switch
                id="settings-today-include-previous"
                checked={todayIncludePreviousIncomplete}
                disabled={isServerSettingsDisabled || !todayEntriesEnabled}
                onCheckedChange={(checked) => {
                  onUpdateSetting({
                    todayIncludePreviousIncomplete: checked,
                  });
                }}
              />
            </div>
          }
        />

        <SettingsRow
          title="Move completed tasks to end"
          description="Reorder checked tasks to the bottom as you complete them."
          controls={
            <div className="flex items-center gap-2">
              <Label htmlFor="settings-today-move-completed-to-end" className="sr-only">
                Move completed tasks to end
              </Label>
              <Switch
                id="settings-today-move-completed-to-end"
                checked={todayMoveCompletedToEnd}
                disabled={isServerSettingsDisabled || !todayEntriesEnabled}
                onCheckedChange={(checked) => {
                  onUpdateSetting({
                    todayMoveCompletedToEnd: checked,
                  });
                }}
              />
            </div>
          }
        />
      </div>
    </div>
  );
}

function HelpTabContent() {
  return (
    <div className="space-y-4">
      <SettingsTabHeader
        title="Help"
        description="Guidance for understanding and using your activity feed."
      />
      <div className="rounded-lg border bg-muted/30 p-4">
        <ActivityFeedInfo />
      </div>
    </div>
  );
}

function downloadArchiveBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

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

  const settingsQuery = useQuery(settingsQueries.all());
  const linkStatusQuery = useQuery(youtubeQueries.authStatus());

  const resolvedSettings = resolveSettingsResponse(settingsQuery.data);
  const scheduleHours = resolvedSettings.smartUpdateScheduleHours;
  const showArchived = resolvedSettings.showArchived;
  const activityFeedSortDate = resolvedSettings.activityFeedSortDate;
  const todayEntriesEnabled = resolvedSettings.todayEntriesEnabled;
  const todayIncludePreviousIncomplete =
    resolvedSettings.todayIncludePreviousIncomplete;
  const todayMoveCompletedToEnd = resolvedSettings.todayMoveCompletedToEnd;

  const [scheduleInput, setScheduleInput] = useState(
    String(DEFAULT_SMART_UPDATE_SCHEDULE_HOURS),
  );
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setScheduleInput(String(scheduleHours));
  }, [scheduleHours]);

  const unlinkMutation = useMutation({
    mutationFn: youtubeApi.unlinkAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: youtubeQueries.authStatus().queryKey,
      });
      void queryClient.invalidateQueries({ queryKey: ["youtube"] });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(settingsQueries.all().queryKey, data);
      setScheduleError(null);
    },
    onError: () => {
      setScheduleError("We couldn't update the smart update schedule. Try again.");
    },
  });

  const exportMutation = useMutation({
    mutationFn: exportContentArchive,
    onMutate: () => {
      setExportError(null);
    },
    onSuccess: ({ blob, fileName }) => {
      downloadArchiveBlob(blob, fileName);
    },
    onError: () => {
      setExportError(
        "We couldn't export your content right now. Please try again.",
      );
    },
  });

  const updateSetting = useCallback(
    (patch: UpdateSettingsInput) => {
      settingsMutation.mutate(patch);
    },
    [settingsMutation],
  );

  const commitSchedule = useCallback(() => {
    if (settingsMutation.isPending || isAccentUpdating) {
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

    updateSetting({ smartUpdateScheduleHours: nextHours });
  }, [
    isAccentUpdating,
    scheduleHours,
    scheduleInput,
    settingsMutation.isPending,
    updateSetting,
  ]);

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

  const isServerSettingsDisabled =
    settingsQuery.isLoading || settingsMutation.isPending || isAccentUpdating;

  const channelTitle = linkStatusQuery.data?.channel?.title ?? "Linked YouTube channel";
  const isLinked = Boolean(linkStatusQuery.data?.linked);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[85dvh] max-h-[85dvh] w-[calc(100vw-1rem)] max-w-4xl gap-0 overflow-hidden p-0 md:h-auto md:max-h-[85vh] md:min-h-[520px]">
        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_1fr] gap-0 md:grid-cols-[220px_1fr] md:grid-rows-1">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="min-h-0 space-y-6 overflow-y-auto overscroll-contain p-6 [-webkit-overflow-scrolling:touch]">
            {activeTab === "account" ? (
              <AccountTabContent
                channelTitle={channelTitle}
                isLinked={isLinked}
                isUnlinking={unlinkMutation.isPending}
                isExporting={exportMutation.isPending}
                exportError={exportError}
                onUnlink={() => unlinkMutation.mutate()}
                onExport={() => exportMutation.mutate()}
              />
            ) : null}

            {activeTab === "journal" ? (
              <JournalTabContent
                publicOnly={publicOnly}
                setPublicOnly={setPublicOnly}
                activityFeedSortDate={activityFeedSortDate}
                showArchived={showArchived}
                scheduleInput={scheduleInput}
                scheduleError={scheduleError}
                isServerSettingsDisabled={isServerSettingsDisabled}
                onUpdateSetting={updateSetting}
                onScheduleChange={handleScheduleChange}
                onScheduleBlur={handleScheduleBlur}
                onScheduleKeyDown={handleScheduleKeyDown}
              />
            ) : null}

            {activeTab === "general" ? (
              <GeneralTabContent
                themePreference={themePreference}
                setThemePreference={setThemePreference}
                accentPreference={accentPreference}
                setAccentPreference={setAccentPreference}
                accentUpdateError={accentUpdateError}
                isAccentDisabled={isServerSettingsDisabled}
              />
            ) : null}

            {activeTab === "today" ? (
              <TodayTabContent
                todayEntriesEnabled={todayEntriesEnabled}
                todayIncludePreviousIncomplete={todayIncludePreviousIncomplete}
                todayMoveCompletedToEnd={todayMoveCompletedToEnd}
                isServerSettingsDisabled={isServerSettingsDisabled}
                onUpdateSetting={updateSetting}
              />
            ) : null}

            {activeTab === "help" ? <HelpTabContent /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
