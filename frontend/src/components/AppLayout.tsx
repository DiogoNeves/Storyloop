import { type ReactNode } from "react";

import { AgentPanel } from "@/components/AgentPanel";
import { NavBar } from "@/components/NavBar";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-muted/20 text-foreground">
      <NavBar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start lg:gap-8 lg:px-6 lg:py-8">
        <main className="flex flex-1 flex-col">{children}</main>
        <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)] lg:w-[360px]">
          <div className="mt-6 flex h-full flex-col lg:mt-0">
            <AgentPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}
