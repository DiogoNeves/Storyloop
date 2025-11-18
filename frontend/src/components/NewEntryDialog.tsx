import { useMemo, useState, type ReactNode, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface NewEntryDialogProps {
  onCreate: (input: { title: string; summary: string; date: string }) => void;
  children: ReactNode;
}

interface FormState {
  title: string;
  summary: string;
  date: string;
}

function roundDateToMinute(date: Date) {
  const rounded = new Date(date);
  rounded.setMilliseconds(0);
  rounded.setSeconds(0);
  return rounded;
}

function formatDateLocal(date: Date) {
  const rounded = roundDateToMinute(date);
  const offset = rounded.getTimezoneOffset();
  const adjusted = new Date(rounded.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

export function NewEntryDialog({ onCreate, children }: NewEntryDialogProps) {
  const [open, setOpen] = useState(false);
  const defaultDate = useMemo(() => formatDateLocal(new Date()), []);
  const [formState, setFormState] = useState<FormState>({
    title: "",
    summary: "",
    date: defaultDate,
  });

  const isValid = formState.title.trim().length > 0 && formState.summary.trim().length > 0;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFormState({ title: "", summary: "", date: formatDateLocal(new Date()) });
    }
    setOpen(nextOpen);
  };

  const handleSubmit = () => {
    if (!isValid) {
      return;
    }

    const date = new Date(formState.date);
    onCreate({
      title: formState.title.trim(),
      summary: formState.summary.trim(),
      date: date.toISOString(),
    });
    setFormState({
      title: "",
      summary: "",
      date: formatDateLocal(new Date()),
    });
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
      return;
    }

    event.preventDefault();
    handleSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="gap-6 p-0 sm:max-w-xl"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="space-y-0 border-b px-6 py-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 text-left">
              <DialogTitle className="text-xl">New entry</DialogTitle>
              <DialogDescription>
                Capture a quick journal note to keep momentum on your narrative.
              </DialogDescription>
            </div>
            <div className="w-full max-w-[200px] text-left text-sm sm:w-auto">
              <Label htmlFor="new-entry-date" className="mb-2 block text-xs uppercase text-muted-foreground">
                Date & time
              </Label>
              <Input
                id="new-entry-date"
                type="datetime-local"
                value={formState.date}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, date: event.target.value }))
                }
              />
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 px-6">
          <div className="space-y-2">
            <Label htmlFor="new-entry-title">Title</Label>
            <Input
              id="new-entry-title"
              placeholder="What happened?"
              value={formState.title}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, title: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-entry-summary">Entry</Label>
            <Textarea
              id="new-entry-summary"
              placeholder="Capture the beats, insights, or takeaways…"
              value={formState.summary}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, summary: event.target.value }))
              }
              rows={6}
            />
          </div>
        </div>

        <DialogFooter className={cn("gap-2 border-t px-6 py-4", "sm:flex-row sm:space-x-2")}
>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            className="sm:ml-auto"
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!isValid}>
            Save entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

