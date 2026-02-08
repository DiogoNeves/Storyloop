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
}

export function TagFilterSection({
  items,
  activeTag,
  onTagSelect,
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
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "gap-2 rounded-full px-3 py-2 font-medium shadow-none",
          "hover:bg-transparent hover:text-foreground",
          isOpen || activeTag ? "text-foreground" : "text-muted-foreground",
        )}
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
          variant="ghost"
          size="sm"
          onClick={() => onTagSelect(null)}
          className="gap-2 rounded-full px-3 py-2 text-foreground shadow-none hover:bg-primary/10"
        >
          {formatTagLabel(activeTag)}
          <span className="text-xs text-muted-foreground">Clear</span>
        </Button>
      ) : null}
      {isOpen ? (
        <div
          id="tag-filter-list"
          className="basis-full pt-1"
        >
          <div className="flex flex-wrap items-center gap-2">
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
        </div>
      ) : null}
    </>
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
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "gap-1 rounded-full px-2.5 shadow-none",
        isSelected
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span className="text-[10px] text-muted-foreground">{count}</span>
    </Button>
  );
}
