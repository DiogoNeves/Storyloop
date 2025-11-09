export function InsightsCard() {
  return (
    <div className="relative h-full rounded-2xl border border-border/70 bg-muted/30 p-6">
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="rounded-lg bg-background/60 px-4 py-2 backdrop-blur-sm">
          <p className="text-xl font-semibold text-muted-foreground">
            Coming Soon
          </p>
        </div>
      </div>
      <div className="opacity-30">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Key Insight
        </h2>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,200px)_1fr]">
          {/* Left section - Top retention clip */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Top retention clip
            </h3>
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
              {/* Placeholder video thumbnail */}
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                <svg
                  className="h-12 w-12 text-muted-foreground/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              {/* Time badge overlay */}
              <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/85 px-2 py-1 text-xs font-medium text-white">
                <span>▶</span>
                <span>1:17-27</span>
              </div>
            </div>
          </div>

          {/* Right section - Retention metrics */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="text-4xl font-bold text-foreground">92%</div>
                <div className="space-y-0.5 text-sm text-muted-foreground">
                  <div>held 92% vs</div>
                  <div>78% median</div>
                </div>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This segment maintains exceptional viewer retention, holding
                  92% of viewers compared to your channel's 78% median. The
                  strong narrative hook and visual pacing in this clip create
                  compelling momentum that keeps audiences engaged.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

