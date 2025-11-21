import { LoopiePanel } from "@/components/LoopiePanel";

export function LoopiePage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 sm:gap-6">
      <section className="rounded-xl border border-border/80 bg-background/90 p-4 shadow-sm sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Loopie assistant
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Chat with Loopie</h1>
        <p className="text-sm text-muted-foreground">
          Keep the conversation going while the main panel is hidden on small screens.
        </p>
      </section>

      <LoopiePanel
        variant="page"
        showConversationLink
        className="flex-1 min-h-[520px]"
      />
    </div>
  );
}
