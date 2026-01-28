import { Check } from "lucide-react";

type ChecklistCardProps = {
  title: string;
  items: string[];
  className?: string;
};

export function ChecklistCard({ title, items, className }: ChecklistCardProps) {
  return (
    <div
      className={`rounded-lg border bg-muted/40 text-muted-foreground ${className ?? ""}`}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <ul className="mt-2 space-y-1 text-xs">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
