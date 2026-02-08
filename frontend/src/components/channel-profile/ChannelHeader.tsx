import { Button } from "@/components/ui/button";

interface ChannelHeaderProps {
  lastUpdatedLabel: string;
  isSaving: boolean;
  onSave: () => void;
}

export function ChannelHeader({
  lastUpdatedLabel,
  isSaving,
  onSave,
}: ChannelHeaderProps) {
  return (
    <section className="rounded-xl border border-border/80 bg-background/90 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Channel identity
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Channel</h1>
          <p className="text-sm text-muted-foreground">
            Define who this channel is for so Loopie can pressure-test ideas
            against your audience.
          </p>
          <p className="text-xs text-muted-foreground">{lastUpdatedLabel}</p>
        </div>
        <Button type="button" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save channel profile"}
        </Button>
      </div>
    </section>
  );
}
