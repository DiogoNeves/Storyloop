import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ContentTypeFilter = "all" | "video" | "short" | "live";

interface ContentTypeTabsProps {
  value: ContentTypeFilter;
  onChange: (value: ContentTypeFilter) => void;
  publicOnly: boolean;
  onPublicOnlyChange: (value: boolean) => void;
}

interface ContentTypeTabProps {
  label: string;
  value: ContentTypeFilter;
  isSelected: boolean;
  onClick: () => void;
}

function ContentTypeTab({ label, isSelected, onClick }: ContentTypeTabProps) {
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
  publicOnly,
  onPublicOnlyChange,
}: ContentTypeTabsProps) {
  return (
    <div className="flex items-center justify-between gap-4">
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
      <div className="flex items-center gap-2">
        <Label
          htmlFor="public-only-toggle"
          className="cursor-pointer text-sm font-medium text-muted-foreground"
        >
          Public only
        </Label>
        <Switch
          id="public-only-toggle"
          checked={publicOnly}
          onCheckedChange={onPublicOnlyChange}
        />
      </div>
    </div>
  );
}
