import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Hash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type TagCount,
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
  const { journalTagCounts, videoTagCounts } = useMemo(() => {
    const journalItems = items.filter((item) => item.category === "journal");
    const videoItems = items.filter((item) => item.category === "content");

    const journalTagCounts = collectTagCounts(journalItems);
    const journalTags = new Set(journalTagCounts.map(({ tag }) => tag));
    const videoTagCounts = collectTagCounts(videoItems).filter(
      ({ tag }) => !journalTags.has(tag),
    );

    return { journalTagCounts, videoTagCounts };
  }, [items]);
  const hasTags = journalTagCounts.length > 0 || videoTagCounts.length > 0;
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
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <TagButton
              label="All tags"
              count={hasTags ? items.length : 0}
              isSelected={!activeTag}
              onClick={() => onTagSelect(null)}
            />
          </div>
          {hasTags ? (
            <div className="flex flex-col gap-3">
              <TagGroup
                heading="In Journals"
                tagCounts={journalTagCounts}
                activeTag={activeTag}
                onTagSelect={onTagSelect}
              />
              <TagGroup
                heading="In Videos"
                tagCounts={videoTagCounts}
                activeTag={activeTag}
                onTagSelect={onTagSelect}
              />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              No tags yet.
            </span>
          )}
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

interface TagGroupProps {
  heading: string;
  tagCounts: TagCount[];
  activeTag: string | null;
  onTagSelect: (tag: string | null) => void;
}

function TagGroup({
  heading,
  tagCounts,
  activeTag,
  onTagSelect,
}: TagGroupProps) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {heading}
        </p>
        <div className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tagCounts.length > 0 ? (
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
          <span className="text-xs text-muted-foreground">No tags.</span>
        )}
      </div>
    </section>
  );
}
