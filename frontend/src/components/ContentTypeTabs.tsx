import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ContentTypeFilter = "all" | "video" | "short" | "live";

interface ContentTypeTabsProps {
  value: ContentTypeFilter;
  onChange: (value: ContentTypeFilter) => void;
}

interface ContentTypeTabProps {
  label: string;
  value: ContentTypeFilter;
  isSelected: boolean;
  onClick: () => void;
}

function ContentTypeTab({
  label,
  isSelected,
  onClick,
}: ContentTypeTabProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "rounded-full px-4 py-2 font-medium transition-colors",
        "hover:bg-primary/10 hover:text-foreground",
        isSelected
          ? "bg-primary/10 text-foreground shadow-none"
          : "text-muted-foreground",
      )}
      onClick={onClick}
      aria-pressed={isSelected}
    >
      {label}
    </Button>
  );
}

export function ContentTypeTabs({
  value,
  onChange,
}: ContentTypeTabsProps) {
  return (
    <div className="flex items-center gap-2">
      <ContentTypeTab
        label="All"
        value="all"
        isSelected={value === "all"}
        onClick={() => onChange("all")}
      />
      <ContentTypeTab
        label="Videos"
        value="video"
        isSelected={value === "video"}
        onClick={() => onChange("video")}
      />
      <ContentTypeTab
        label="Shorts"
        value="short"
        isSelected={value === "short"}
        onClick={() => onChange("short")}
      />
      <ContentTypeTab
        label="Lives"
        value="live"
        isSelected={value === "live"}
        onClick={() => onChange("live")}
      />
    </div>
  );
}

