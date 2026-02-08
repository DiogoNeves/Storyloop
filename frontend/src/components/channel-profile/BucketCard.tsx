import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface BucketCardProps {
  title: string;
  showRemove?: boolean;
  onRemove?: () => void;
  children: ReactNode;
}

export function BucketCard({
  title,
  showRemove,
  onRemove,
  children,
}: BucketCardProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {showRemove && onRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
