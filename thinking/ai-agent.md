# AI Agent Design

## Overview

The Storyloop AI agent serves as an intelligent assistant that helps creators understand their channel performance, discover insights, and track patterns over time. The agent combines contextual awareness of the current screen state with deep knowledge of YouTube analytics and creator best practices.

## Core Principles

1. **Always Accessible** - The agent should be available from anywhere in the application through a persistent interface
2. **Context-Aware** - The agent understands what the user is currently viewing and can reference on-screen data
3. **Data Exploration** - The agent can query and explore any data available through the readonly APIs
4. **Actionable Intelligence** - The agent provides curated, specialist advice tailored to different creator types and account stages
5. **Proactive Tracking** - Users can request insight tracking through natural conversation, and the agent can set up background monitoring

## User Interface Design

**Design:** [Agent/Chatbot Design](../design/with-chatbot.png) (Future)

### Accessibility Pattern

The agent should be accessible through:

- **Persistent Chat Interface** - A floating chat button or sidebar that remains visible across all pages
- **Contextual Trigger** - Ability to invoke the agent from specific UI elements (e.g., "Ask about this video" button on video cards)
- **Keyboard Shortcut** - Quick access via keyboard (e.g., `Cmd/Ctrl + K`)

### UI Components

- **Chat Window** - Collapsible sidebar or modal dialog
- **Message History** - Persistent conversation thread per session
- **Context Indicators** - Visual cues showing what data the agent has access to (e.g., "Viewing: Video Detail Page - 'My Latest Video'")
- **Suggested Actions** - Quick action buttons for common queries
- **Loading States** - Clear feedback when the agent is processing or querying data

## Context Awareness

### Screen Context Detection

The agent should automatically detect and include:

- **Current Page/Route** - Dashboard, video detail, insights view, etc.
- **Visible Data** - Currently displayed videos, entries, insights, or metrics
- **Selected Items** - Any highlighted or selected content items
- **Time Range** - Active date range filters or time period selections
- **User State** - Current channel, preferences, and tracking configuration

### Context Injection

When a user asks a question, the agent receives:

```typescript
{
  currentPage: "dashboard" | "video-detail" | "insights" | ...,
  visibleItems: Video[] | Entry[] | Insight[],
  selectedItem?: Video | Entry | Insight,
  filters: {
    dateRange?: { start: Date, end: Date },
    contentType?: string[],
    // ... other active filters
  },
  userContext: {
    channelId: string,
    channelType: "gaming" | "education" | "lifestyle" | ...,
    accountStage: "early" | "growing" | "established",
    // ... user preferences
  }
}
```

## API Access & Data Exploration

### Readonly API Access

The agent has access to all readonly endpoints:

- **Growth Metrics** - `/api/growth/*` endpoints for SGI scores, component breakdowns, trends
- **Entries** - `/api/entries/*` endpoints for journal entries and content items
- **YouTube Data** - `/api/youtube/*` endpoints for video metrics, channel stats, historical data
- **Insights** - Access to generated insights and tracking configurations

### Query Capabilities

The agent can:

- **Query Historical Data** - "Show me videos from the last 3 months with retention above 60%"
- **Compare Metrics** - "Compare my Discovery scores from Q1 vs Q2"
- **Identify Patterns** - "What days of the week do my videos perform best?"
- **Analyze Trends** - "How has my Loyalty score changed over the past 6 months?"

### Data Privacy & Security

- Agent operates in readonly mode - cannot modify data or settings
- All queries are logged for transparency
- User can review agent queries in a history/log view
- Sensitive data (API keys, tokens) are never exposed to the agent

## Specialist Knowledge & Advice

### Curated YouTube Expertise

The agent maintains curated knowledge bases for:

#### General YouTube Best Practices

- **Thumbnail & Title Optimization** - Best practices for CTR improvement
- **Upload Timing** - Research-backed optimal posting schedules
- **Content Length** - Duration sweet spots for different content types
- **Engagement Strategies** - Techniques for improving retention and loyalty
- **Algorithm Understanding** - How YouTube's recommendation system works

**Note:** The agent should also extract and provide useful insights such as publishing frequency analysis, content performance patterns, timing optimization, retention patterns, subscriber growth patterns, and common advice patterns (e.g., consistency over volume, quality signals, audience building strategies).

#### Account Type-Specific Guidance

The agent adapts advice based on channel characteristics:

**Gaming Channels:**

- Focus on hook retention (first 30 seconds)
- Optimal video length (10-20 minutes)
- Thumbnail strategies (action shots, faces)
- Series consistency tracking

**Education Channels:**

- Information density optimization
- Chapter markers and structure
- Viewer completion rates
- Subscriber conversion patterns

**Lifestyle/Vlog Channels:**

- Personal connection metrics
- Consistency vs. quality balance
- Community engagement patterns
- Multi-platform strategies

**Tutorial/How-To Channels:**

- Search-driven discovery patterns
- Long-tail keyword optimization
- Viewer intent matching
- Re-watch value indicators

#### Account Stage Guidance

**Early Stage (< 5 videos):**

- Baseline establishment
- YouTube's `relativeRetentionPerformance` as reference
- Focus on consistency over optimization
- Building initial audience patterns

**Growing Stage (5-50 videos):**

- Trend identification
- Pattern recognition against own history
- A/B testing strategies
- Subscriber conversion optimization

**Established Stage (50+ videos):**

- Advanced pattern analysis
- Long-term trend monitoring
- Content diversification strategies
- Audience retention optimization

### Knowledge Curation

- **Expert Review** - Specialist advice is reviewed and validated by YouTube growth experts
- **Version Control** - Knowledge base is versioned and updated based on platform changes
- **Source Attribution** - Advice includes references to YouTube Creator Academy, research, or verified best practices
- **Regular Updates** - Knowledge base is refreshed quarterly to reflect platform changes

## Insight Tracking & Setup

### Natural Language Insight Requests

Users can request insight tracking through conversation:

**Examples:**

- "Track how my hook retention changes when I use question-based titles"
- "Monitor if videos posted on Tuesdays get more early views"
- "Alert me when my subscriber conversion rate drops below my average"
- "Track the correlation between video length and average view percentage"

### Insight Configuration

When a user requests tracking, the agent:

1. **Parses Intent** - Understands what metric/pattern to track
2. **Validates Feasibility** - Confirms the requested data is available
3. **Suggests Parameters** - Proposes tracking frequency, thresholds, comparison baselines
4. **Creates Background Action** - Sets up scheduled monitoring job
5. **Confirms Setup** - Provides clear confirmation of what will be tracked

### Background Monitoring

The agent can create background actions that:

- **Periodic Checks** - Run on schedule (daily, weekly, monthly)
- **Threshold Alerts** - Trigger when metrics cross defined thresholds
- **Pattern Detection** - Identify emerging trends or anomalies
- **Comparative Analysis** - Compare current performance against historical baselines

### Insight Generation

When patterns are detected, the agent:

- **Generates Insight Entry** - Creates an insight item in the activity feed
- **Provides Context** - Explains what changed and why it matters
- **Suggests Actions** - Recommends next steps or experiments
- **Links Related Data** - References relevant videos, entries, or metrics

## Conversation Flow Examples

### Example 1: Contextual Question

**User:** "Why did this video perform better than my last one?"

**Agent Context:**

- Current page: Video Detail Page
- Selected item: Video "My Latest Tutorial" (SGI: 78)
- Visible items: Previous video "Previous Tutorial" (SGI: 65)

**Agent Response:**
"I can see you're comparing 'My Latest Tutorial' (SGI: 78) with 'Previous Tutorial' (SGI: 65). The improvement comes from:

- **Discovery (+12 points)**: Your latest video gained 2.3× more views in the first week, likely due to the more specific title and thumbnail showing the end result
- **Retention (+8 points)**: Average view percentage improved from 58% to 67%, with stronger hook retention in the first 30 seconds
- **Loyalty (+3 points)**: Subscriber conversion increased slightly (4.2 vs 3.8 per 1K views)

The main difference appears to be your hook - the first 30 seconds of the latest video retained 15% more viewers. Would you like me to track hook performance going forward?"

### Example 2: Data Exploration

**User:** "Show me all videos where my retention was above 70%"

**Agent Response:**
"I found 12 videos with retention above 70%:

1. 'Advanced Tutorial Series Part 3' - 74% retention, posted Tuesday 10am
2. 'Quick Tips: Editing Workflow' - 72% retention, posted Thursday 2pm
3. ...

**Pattern I notice:** 8 of these 12 videos were posted on Tuesday or Thursday mornings. Would you like me to track upload timing patterns to confirm this?"

### Example 3: Insight Setup

**User:** "Track if my subscriber conversion improves when I mention my next video in the outro"

**Agent Response:**
"I'll track subscriber conversion rates for videos where you mention the next video in the outro vs. those that don't.

**Tracking Setup:**

- Metric: Subscribers per 1K Views (SPV)
- Comparison: Videos with outro callout vs. without
- Frequency: Weekly analysis
- Alert: When difference exceeds 20%

I'll analyze your last 20 videos to establish a baseline and start monitoring. You'll see insights appear in your feed when patterns emerge. Should I continue?"

**User:** "Yes, continue"

**Agent:** "Tracking enabled! I'll check your videos weekly and notify you when I detect significant patterns."

## Technical Architecture

### Agent Service Integration

**Backend Service:** `backend/app/services/agent.py` (Future)

**Responsibilities:**

- Process natural language queries
- Inject context from frontend
- Query readonly APIs
- Generate responses using LLM (OpenAI/Anthropic)
- Create background tracking actions
- Generate insight entries

**API Endpoints:**

```
POST /api/agent/chat
  - Request: { message, context }
  - Response: { response, suggestedActions, queries }

POST /api/agent/track
  - Request: { trackingConfig, description }
  - Response: { trackingId, confirmation }

GET /api/agent/history
  - Response: { conversations[] }
```

### Frontend Integration

**Component:** `frontend/src/components/AgentChat.tsx` (Future)

**Features:**

- Persistent chat interface
- Context detection and injection
- Message history management
- Suggested actions display
- Loading and error states

**State Management:**

- TanStack Query for agent API calls
- Local state for conversation history
- Context detection hooks for screen awareness

### LLM Integration

**Model Selection:**

- Primary: GPT-4 or Claude (for complex reasoning)
- Fallback: GPT-3.5-turbo (for simple queries)
- Specialized: Fine-tuned model for YouTube analytics (future)

**Prompt Engineering:**

- System prompt includes: role definition, knowledge base, API access patterns
- User prompt includes: current message, screen context, conversation history
- Response format: Structured JSON with text, actions, queries, citations

**Token Management:**

- Context window optimization
- Conversation summarization for long threads
- Knowledge base retrieval (RAG) for specialist advice

## Future Development

### ChatGPT Pulse-Style Daily Blog

**Concept:** Generate a daily personalized blog post summarizing the creator's channel state, recent performance, and actionable insights.

**Features:**

- **Daily Summary** - Overview of yesterday's performance, new insights, and trends
- **Weekly Deep Dive** - Comprehensive analysis of the past week's patterns
- **Monthly Report** - Long-term trend analysis and strategic recommendations
- **Personalized Tone** - Adapts writing style to match creator's preferences
- **Visual Elements** - Includes charts, graphs, and visual summaries
- **Actionable Takeaways** - Clear next steps and experiments to try

**Implementation:**

- Scheduled generation (daily at user's preferred time)
- Template-based structure with dynamic content
- Export options (PDF, markdown, shareable link)
- Archive and search functionality
- Integration with activity feed

**Example Output:**

```
# Your Storyloop Daily - March 15, 2024

## Today's Pulse

Your channel is showing strong momentum! Your latest video "Advanced Tutorial"
scored an SGI of 82, your highest in the past month. Here's what's working:

### What's Working
- **Hook Retention**: Your first 30 seconds are retaining 18% more viewers than
  your average. The direct question in your opening is clearly effective.
- **Discovery Velocity**: Tuesday morning uploads continue to outperform other
  days by 25% on average.

### Opportunities
- **Subscriber Conversion**: Your subscriber conversion rate (3.2 per 1K views)
  is below your channel average (4.1). Consider adding a stronger call-to-action
  in your outro.

## This Week's Insights

1. Your 10-15 minute videos are performing 12% better than shorter content
2. Thumbnails with text overlays are getting 30% more early views
3. Educational series are driving 2× more subscriber conversions

## Recommended Actions

1. **Experiment**: Try posting your next video on Tuesday morning to test the
   timing pattern
2. **Optimize**: Add a clear outro callout mentioning your next video
3. **Track**: Monitor if your hook retention pattern continues with question-based
   openings

---

*Generated by Storyloop AI Agent*
```

### Additional Future Enhancements

- **Multi-Channel Support** - Agent can compare and analyze multiple channels
- **Competitor Analysis** - Compare performance against similar channels (with permission)
- **Content Planning** - Suggest content ideas based on performance patterns
- **A/B Testing Framework** - Built-in experimentation tools with agent-guided setup
- **Voice Interface** - Voice commands and responses for hands-free interaction
- **Mobile App Integration** - Agent accessible via mobile app with push notifications
- **Community Insights** - Aggregate insights from similar creators (anonymized)

## Implementation Phases

### Phase 1: Core Agent (MVP)

- Basic chat interface with persistent access
- Context detection for current page/selected items
- Readonly API access for data queries
- Simple LLM integration for Q&A
- Basic knowledge base for YouTube best practices

### Phase 2: Insight Tracking

- Natural language parsing for tracking requests
- Background action creation and scheduling
- Insight generation and feed integration
- Tracking configuration UI

### Phase 3: Specialist Knowledge

- Curated knowledge base implementation
- Account type detection and adaptation
- Account stage-specific guidance
- Expert-reviewed advice system

### Phase 4: Advanced Features

- Daily blog generation (ChatGPT Pulse-style)
- Advanced pattern detection
- Predictive analytics
- Multi-channel support

## Success Metrics

- **Engagement**: Average conversations per user per week
- **Value**: Percentage of users who set up tracking through agent
- **Accuracy**: User satisfaction with agent responses (thumbs up/down)
- **Efficiency**: Time saved vs. manual analysis
- **Retention**: Users who return to use agent regularly
