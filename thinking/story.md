# The Story of Storyloop

## A Creator's Journey

Imagine being a new creator staring at your first few uploads. You sit down with coffee, open the analytics dashboard, and get blasted with more graphs than guidance. The problem isn't a lack of data—it's too much data and too little direction. Someone else's growth playbook is stitched into every chart, and the things you tried disappear in the noise. You want the momentum that carries you toward your first 100k subscribers or views, but all you see are metrics without a map.

Storyloop was born out of that frustration. I wanted a way to stay curious about my channel without drowning in dashboards—a place where my intent, my hypotheses, and my results lived in the same loop. I needed a guide that met me where I was instead of handing me a generic checklist.

## How Storyloop Keeps You Oriented

### Start with Intent

Every new experiment starts with a natural-language goal: *"I want my next upload to earn 100 more returning viewers"* or *"Test tighter pacing on tutorial intros."* Storyloop stores those goals as journal entries—simple notes capturing your creative decisions and reflections. The journal stays focused on what you did and why, without trying to automatically parse your intent. Instead of reverse-engineering someone else's trends, you get feedback on the risks you're actually taking.

### The Weekly Rhythm

Each week, Storyloop syncs your channel data while you sleep, recalculates your Growth Score, and surfaces the shifts that matter. See [thinking/insights.md](insights.md) for the full scoring and insights logic behind that number. On Monday morning you might see, *"Videos with tighter pacing improved retention by 14%."* It's the kind of direction that helps you decide the very next move, not a firehose demanding daily refreshes, and it keeps you focused on the experiments that move you toward 100k.

### Connecting Notes to Outcomes

When the new numbers land, Storyloop links them to the journal entries that inspired them. The idea you scribbled down—*"Shorter intros with a direct hook"*—now sits beside the results that prove whether it worked. For deeper insights, you can interact with an AI agent—ask it questions, request it to track specific metrics, or have it analyze patterns across your content. The agent can save actions to run in the background, automatically generating insights and adding them to your timeline as patterns emerge. Wins become repeatable patterns, not lucky guesses, and even the misses point you toward what to try next on the path to 100k.

## Living With Storyloop

**Design:** [Main Screen Design](../design/main-screen.png)

- **First-time setup:** Select which channel to track, and Storyloop remembers your choice for all future sessions.
- **Morning check-in:** Review your Growth Score and simple score chart at the top of the dashboard, then scroll through the timeline to see the story behind the trend before you dive into editing or scripting. Each insight reinforces the direction you need to turn raw effort into your next milestone.
- **Post-upload reflection:** Capture the creative choices you made in your own words—simple journal entries that document what you did and why.
- **Agent interaction:** When you want deeper analysis, interact with an AI agent. Ask questions, request it to track specific insights, and the agent can save background actions to monitor patterns over time.
- **Timeline view:** See everything together—your content (videos, lives, shorts, posts), your journal entries, and AI-generated insights—all in one chronological timeline. Insights come from agent interactions, not automatic parsing of journal entries.
- **Weekly review:** Let the app highlight emerging patterns, then plan your next experiment with clarity instead of guesswork.

It's still storytelling—only now, the story is about how you grow.

## Technical Stack

Storyloop stays intentionally simple so it never gets in your way:

- **FastAPI** orchestrates data syncs and serves the journal API.
- **React (Vite)** keeps the interface quick and comfortable for daily use.
- **SQLite + APScheduler** quietly persist history and run weekly jobs.
- **TanStack Query** caches requests so insights feel instant.

## Looking Forward

Storyloop will keep evolving—more platforms, smarter insights, deeper creative prompts—but its promise stays the same: give creators control, clarity, and purpose. In the future, each video will have its own detail page ([Video Detail Design](../design/video-detail.png)) where you can dive deeper into performance metrics, related insights, and notes. Most insights will be AI-inferred through agent interactions ([Agent/Chatbot Design](../design/with-chatbot.png)), with the agent analyzing your journal entries and performance data to connect your creative experiments to measurable outcomes. Every enhancement aims to give you clearer direction so scaling toward 100k feels less like guesswork and more like following a map you trust.

I built Storyloop because I was tired of chasing opaque metrics. I wanted a tool that helps me ask my own questions, see my own progress, and turn my creative journey into a story worth following.

