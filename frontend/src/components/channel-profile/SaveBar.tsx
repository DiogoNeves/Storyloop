import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";

interface SaveBarProps {
  saveMessage: string | null;
  saveError: string | null;
  hasLoadError: boolean;
  isSaving: boolean;
}

export function SaveBar({
  saveMessage,
  saveError,
  hasLoadError,
  isSaving,
}: SaveBarProps) {
  return (
    <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <StatusMessage type="success" message={saveMessage} />
        <StatusMessage type="error" message={saveError} />
        {hasLoadError ? (
          <StatusMessage
            type="error"
            message="We couldn't load the channel profile."
          />
        ) : null}
      </div>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? "Saving..." : "Save channel profile"}
      </Button>
    </div>
  );
}
