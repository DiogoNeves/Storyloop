import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ContentType = "video" | "short";

interface ContentTypeTogglesProps {
  selectedTypes: Set<ContentType>;
  onChange: (types: Set<ContentType>) => void;
}

export function ContentTypeToggles({
  selectedTypes,
  onChange,
}: ContentTypeTogglesProps) {
  const toggleType = (type: ContentType) => {
    const next = new Set(selectedTypes);
    if (next.has(type)) {
      next.delete(type);
      // Ensure at least one type is always selected
      if (next.size === 0) {
        return;
      }
    } else {
      next.add(type);
    }
    onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">
        Content type:
      </span>
      <div className="inline-flex rounded-md border border-input bg-background shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-r-none border-r border-input",
            selectedTypes.has("video") &&
              "bg-primary/10 font-semibold hover:bg-primary/10 hover:text-foreground",
          )}
          onClick={() => toggleType("video")}
          aria-pressed={selectedTypes.has("video")}
        >
          Long videos
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-l-none",
            selectedTypes.has("short") &&
              "bg-primary/10 font-semibold hover:bg-primary/10 hover:text-foreground",
          )}
          onClick={() => toggleType("short")}
          aria-pressed={selectedTypes.has("short")}
        >
          Shorts
        </Button>
      </div>
    </div>
  );
}

