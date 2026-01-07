import { CloudOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Small badge indicating an entry is pending sync.
 */
export function PendingSyncBadge() {
  return (
    <Badge
      variant="secondary"
      className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
    >
      <CloudOff className="h-3 w-3" />
      Pending sync
    </Badge>
  );
}
