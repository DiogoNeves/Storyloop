export function ActivityFeedInfo() {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="mb-2 font-semibold">What's included</h3>
        <p className="text-muted-foreground">
          The activity feed combines different types of content in chronological
          order:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
          <li>
            <strong>Publishing milestones</strong> - Track your content creation
            progress
          </li>
          <li>
            <strong>Insights</strong> - Key moments and reflections
          </li>
          <li>
            <strong>Journal entries</strong> - Personal notes and thoughts
          </li>
          <li>
            <strong>YouTube uploads</strong> - Recent videos from your connected
            channel
          </li>
        </ul>
      </div>
      <div>
        <h3 className="mb-2 font-semibold">Using it for journaling</h3>
        <p className="text-muted-foreground">
          Click on any activity item to add journal entries, reflect on
          milestones, or capture insights. You can edit or delete your own
          entries at any time. The feed helps you maintain a comprehensive
          record of your creative journey.
        </p>
      </div>
      <div>
        <h3 className="mb-2 font-semibold">Filtering</h3>
        <p className="text-muted-foreground">
          In the future, you'll be able to filter the feed to show only specific
          types of content, making it easier to focus on what matters most to
          you.
        </p>
      </div>
    </div>
  );
}

