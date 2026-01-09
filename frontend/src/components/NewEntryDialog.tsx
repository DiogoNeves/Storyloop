import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
import { DateTimeButton } from "@/components/ui/date-time-button";

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
  const formRef = useRef<HTMLFormElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const summaryRef = useRef<HTMLTextAreaElement | null>(null);
  const hasFocusedRef = useRef(false);

  const isValid = formState.title.trim().length > 0 && formState.summary.trim().length > 0;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFormState({ title: "", summary: "", date: formatDateLocal(new Date()) });
      hasFocusedRef.current = false;
    } else {
      hasFocusedRef.current = false;
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

  useEffect(() => {
    if (!open || hasFocusedRef.current) {
      return;
    }

    const isEditingExistingTitle = formState.title.trim().length > 0;
    const target = isEditingExistingTitle ? summaryRef.current : titleRef.current;
    target?.focus({ preventScroll: true });

    if (isEditingExistingTitle && summaryRef.current) {
      const endPosition = summaryRef.current.value.length;
      summaryRef.current.setSelectionRange(endPosition, endPosition);
      summaryRef.current.scrollTop = summaryRef.current.scrollHeight;
    }

    hasFocusedRef.current = true;
  }, [open, formState.title]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="gap-6 p-0 sm:max-w-xl">
        <DialogHeader className="space-y-0 border-b px-6 py-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 text-left">
              <DialogTitle className="text-xl">New entry</DialogTitle>
              <DialogDescription>
                Capture a quick journal note to keep momentum on your narrative.
              </DialogDescription>
            </div>
            <DateTimeButton
              id="new-entry-date"
              name="new-entry-date"
              value={formState.date}
              onChange={(nextDate) =>
                setFormState((prev) => ({ ...prev, date: nextDate }))
              }
              wrapperClassName="w-full max-w-[220px] sm:w-auto"
              buttonClassName="w-full justify-between sm:w-auto"
            />
          </div>
        </DialogHeader>

        <form
          ref={formRef}
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <div className="space-y-6 px-6">
            <div className="space-y-2">
              <Label htmlFor="new-entry-title">Title</Label>
              <Input
                id="new-entry-title"
                placeholder="What happened?"
                value={formState.title}
                ref={titleRef}
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
                ref={summaryRef}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, summary: event.target.value }))
                }
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
                rows={6}
              />
            </div>
          </div>

          <DialogFooter className={cn("gap-2 border-t px-6 py-4", "sm:flex-row sm:space-x-2")}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="sm:ml-auto"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid}>
              Save entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

