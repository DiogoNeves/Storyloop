import { useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
>;

interface DateTimeButtonProps extends NativeInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  buttonClassName?: string;
  wrapperClassName?: string;
}

export function DateTimeButton({
  value,
  onChange,
  label = "Date & time",
  placeholder = "Select date",
  disabled,
  buttonClassName,
  wrapperClassName,
  ...inputProps
}: DateTimeButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const displayValue = useMemo(() => {
    if (!value) {
      return placeholder;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return placeholder;
    }

    const dateFormatter = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    });
    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}`;
  }, [placeholder, value]);

  const handleButtonClick = () => {
    if (!inputRef.current || disabled) {
      return;
    }

    inputRef.current.showPicker?.();
    inputRef.current.focus({ preventScroll: true });
  };

  return (
    <div className={cn("flex flex-col text-left text-xs", wrapperClassName)}>
      <button
        type="button"
        className={cn(
          "inline-flex flex-wrap items-baseline gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
          buttonClassName,
        )}
        onClick={handleButtonClick}
        disabled={disabled}
      >
        <span>{label}</span>
        <span className="text-sm font-medium normal-case tracking-normal text-foreground">
          {displayValue}
        </span>
      </button>
      <input
        {...inputProps}
        ref={inputRef}
        type="datetime-local"
        className="sr-only"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
      />
    </div>
  );
}

