import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DictationSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
}

export function DictationSetupDialog({
  open,
  onOpenChange,
  onOpenSettings,
}: DictationSetupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>OpenAI key required for dictation</DialogTitle>
          <DialogDescription>
            Set your OpenAI API key in Settings → General → Model settings
            before using dictation.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onOpenSettings ? (
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onOpenSettings();
              }}
            >
              Open Settings
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
