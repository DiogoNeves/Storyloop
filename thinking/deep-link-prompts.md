# Storyloop Deep Link Prompting Guide

Use this guide when generating markdown links to in-app pages. Always present links as descriptive markdown labels (e.g., `[Open journal reflection](/journals/123)`) so the URL is not exposed directly. Routes come from the React router in `frontend/src/App.tsx`.

## Core routes to use

- **Journal list:** `/` or `/journal` render the main journal feed within the app shell.
- **Journal detail:** `/journals/{journalId}` loads a specific journal entry.
- **Conversation detail:** `/conversations/{conversationId}` opens a saved Loopie conversation thread.
- **Video detail:** `/videos/{videoId}` shows the Storyloop video detail view (use this when sharing video links).
- **Insights dashboard:** `/insights` opens the insights view inside the application.
- **Loopie workspace:** `/loopie` opens the dedicated Loopie canvas.

## Prompting rules for links

1. **Prefer journals and conversations.** When a user asks to link back to past work, surface journal and conversation links first:
   - Journal detail: `[Review journal {title or date}](/journals/{journalId})`
   - Conversation detail: `[Reopen Loopie chat about {topic}](/conversations/{conversationId})`
2. **Videos:** When asked for a video link, use the in-app detail route so the user lands on the enriched Storyloop view: `[View {video title} in Storyloop](/videos/{videoId})`.
3. **Lists vs. detail:** Use `/` or `/journal` for a general journal list link (`[Browse all journals](/journal)`), and the ID-specific routes for precise references.
4. **Markdown only:** Always return links as markdown with a short, friendly description. Do not show bare URLs.
5. **Consistency:** Keep links relative (start with `/`) so they work in all app environments.
