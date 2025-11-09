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
  const handleToggle = (clickedType: ContentType) => {
    const isBothSelected = selectedTypes.size === 2;
    const isOnlyClickedSelected =
      selectedTypes.has(clickedType) && selectedTypes.size === 1;

    if (isBothSelected) {
      // Both selected: deselect the other, keep only clicked one
      onChange(new Set([clickedType]));
    } else if (isOnlyClickedSelected) {
      // Only clicked one selected: do nothing
      return;
    } else {
      // Only other one selected: add clicked one (both become selected)
      onChange(new Set([...selectedTypes, clickedType]));
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">
        Content type:
      </span>
      <div className="inline-flex rounded-md border border-input bg-background shadow-sm">
        <ContentTypeToggle
          label="Videos"
          isSelected={selectedTypes.has("video")}
          onClick={() => handleToggle("video")}
        />
        <ContentTypeToggle
          label="Shorts"
          isSelected={selectedTypes.has("short")}
          onClick={() => handleToggle("short")}
        />
      </div>
    </div>
  );
}

interface ContentTypeToggleProps {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}

function ContentTypeToggle({
  label,
  isSelected,
  onClick,
}: ContentTypeToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "first:rounded-r-none first:border-r first:border-input last:rounded-l-none",
        "hover:bg-primary/10 hover:text-foreground",
        isSelected && "bg-primary/10 font-semibold",
      )}
      onClick={onClick}
      aria-pressed={isSelected}
    >
      {label}
    </Button>
  );
}
