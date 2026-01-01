import type { ReactNode } from "react";

import { LoopiePanel } from "./LoopiePanel";

interface TwoColumnDetailLayoutProps {
  leftTop?: ReactNode;
  left: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function TwoColumnDetailLayout({
  leftTop,
  left,
  right,
  className,
}: TwoColumnDetailLayoutProps) {
  return (
    <div
      className={`relative grid h-full min-h-[calc(100vh-4rem)] w-full grid-cols-1 gap-6 px-6 py-10 sm:py-12 lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:grid-cols-3 lg:overflow-hidden lg:px-10 xl:px-16 ${className ?? ""}`}
    >
      <div className="col-span-2 flex h-full min-h-0 flex-col gap-6 overflow-hidden">
        {leftTop ? leftTop : null}
        {left}
      </div>
      <div className="col-span-1 hidden h-full min-h-0 lg:flex">
        {right ?? <LoopiePanel />}
      </div>
    </div>
  );
}




