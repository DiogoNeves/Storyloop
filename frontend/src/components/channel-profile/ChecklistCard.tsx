import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistCardProps {
  title: string;
  items: string[];
  className?: string;
}

export function ChecklistCard({ title, items, className }: ChecklistCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between gap-2 text-left transition-colors hover:text-foreground focus:outline-none"
        aria-expanded={isExpanded}
      >
        <p className="text-sm font-medium text-foreground">{title}</p>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            isExpanded && "rotate-180",
          )}
        />
      </button>
      {isExpanded && (
        <ul className="mt-2 space-y-1 text-xs">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
