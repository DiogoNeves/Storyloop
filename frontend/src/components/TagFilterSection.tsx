import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Hash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  collectTagCounts,
  formatTagLabel,
} from "@/lib/activity-tags";
import type { ActivityItem } from "@/lib/types/entries";

interface TagFilterSectionProps {
  items: ActivityItem[];
  activeTag: string | null;
  onTagSelect: (tag: string | null) => void;
  className?: string;
}

export function TagFilterSection({
  items,
  activeTag,
  onTagSelect,
  className,
}: TagFilterSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tagCounts = useMemo(() => collectTagCounts(items), [items]);
  const hasTags = tagCounts.length > 0;
  const toggleIcon = isOpen ? (
    <ChevronUp className="h-4 w-4" aria-hidden="true" />
  ) : (
    <ChevronDown className="h-4 w-4" aria-hidden="true" />
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsOpen((current) => !current)}
          className="gap-2"
          aria-expanded={isOpen}
          aria-controls="tag-filter-list"
        >
          <Hash className="h-4 w-4" aria-hidden="true" />
          Tags
          {toggleIcon}
        </Button>
        {activeTag ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onTagSelect(null)}
            className="gap-2"
          >
            {formatTagLabel(activeTag)}
            <span className="text-xs text-muted-foreground">Clear</span>
          </Button>
        ) : null}
      </div>
      {isOpen ? (
        <div
          id="tag-filter-list"
          className="flex flex-wrap items-center gap-2"
        >
          <TagButton
            label="All tags"
            count={hasTags ? items.length : 0}
            isSelected={!activeTag}
            onClick={() => onTagSelect(null)}
          />
          {hasTags ? (
            tagCounts.map((tagCount) => (
              <TagButton
                key={tagCount.tag}
                label={formatTagLabel(tagCount.tag)}
                count={tagCount.count}
                isSelected={activeTag === tagCount.tag}
                onClick={() => onTagSelect(tagCount.tag)}
              />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              No tags yet.
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface TagButtonProps {
  label: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}

function TagButton({
  label,
  count,
  isSelected,
  onClick,
}: TagButtonProps) {
  return (
    <Button
      type="button"
      variant={isSelected ? "secondary" : "ghost"}
      size="sm"
      onClick={onClick}
      className="gap-1"
    >
      <span>{label}</span>
      <span className="text-[10px] text-muted-foreground">{count}</span>
    </Button>
  );
}
