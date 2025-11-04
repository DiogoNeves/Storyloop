# Storyloop Roadmap

> A comprehensive plan to evolve Storyloop from a YouTube growth journal into a complete creator ecosystem with AI-powered insights, sponsor matching, and content production tools.

---

## Table of Contents
- [Current State](#current-state)
- [Phase 1: Foundation & Core Improvements](#phase-1-foundation--core-improvements-near-term)
- [Phase 2: AI Agent & Advanced Analytics](#phase-2-ai-agent--advanced-analytics-medium-term)
- [Phase 3: Content Production Suite](#phase-3-content-production-suite-medium-term)
- [Phase 4: Creator-Sponsor Network](#phase-4-creator-sponsor-network-long-term)
- [Technical Architecture Evolution](#technical-architecture-evolution)
- [Success Metrics](#success-metrics)

---

## Current State

### What We Have
- ✅ YouTube channel integration (fetch videos, classify types)
- ✅ Journal entry system (content, insights, journal categories)
- ✅ Activity feed with timeline view
- ✅ Basic growth score visualization
- ✅ React + TypeScript frontend
- ✅ FastAPI + Python backend
- ✅ SQLite database
- ✅ Background job scheduler (APScheduler)
- ✅ OpenAI API key configured (not yet used)
- ✅ YouTube API integration

### What's Missing
- ❌ User authentication & multi-tenancy
- ❌ Rich text editing for entries
- ❌ Video analytics tracking (views, engagement over time)
- ❌ AI-powered insights and recommendations
- ❌ Content ideation and script tools
- ❌ Asset library and content reuse system
- ❌ Creator scoring and profiling
- ❌ Sponsor marketplace

---

## Phase 1: Foundation & Core Improvements (Near-Term)
**Timeline: 1-2 months**

### 1.1 Authentication & User Management
**Priority: Critical**

- [ ] Implement OAuth 2.0 flow with YouTube
  - Use existing `YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET`
  - Enable OAuth consent screen in Google Cloud Console
  - Add `/auth/login`, `/auth/callback`, `/auth/logout` endpoints
- [ ] Create `users` table with profile fields
  - `id`, `email`, `youtube_channel_id`, `display_name`, `avatar_url`
  - `created_at`, `subscription_tier`, `preferences`
- [ ] Add JWT-based session management
  - Store access/refresh tokens securely
  - Implement middleware for protected routes
- [ ] Scope all entries to authenticated users
  - Add `user_id` foreign key to `entries` table
  - Update all queries to filter by `user_id`
- [ ] Build user profile page
  - Display YouTube channel info
  - Show subscription status
  - Allow preference settings

**Technical Notes:**
- Use `python-jose` for JWT encoding/decoding
- Store OAuth tokens in database (encrypted)
- Frontend: Store JWT in httpOnly cookie or localStorage
- Add user context to React Query for automatic scoping

---

### 1.2 Enhanced Entry System
**Priority: High**

- [ ] Rich text editor for summaries
  - Integrate TipTap or ProseMirror
  - Support markdown shortcuts
  - Add @mentions, #tags, and links
- [ ] Entry tagging system
  - Create `tags` and `entry_tags` tables
  - Enable autocomplete for existing tags
  - Filter activity feed by tags
- [ ] Entry attachments
  - Support images, PDFs, screenshots
  - Store in local filesystem or S3
  - Show thumbnails in activity feed
- [ ] Entry templates
  - Pre-filled templates for common entry types
  - "Video Post-Mortem", "Content Idea", "Weekly Review"
- [ ] Search functionality
  - Full-text search across titles and summaries
  - Filter by date range, category, tags
  - Search bar in navbar

**Technical Notes:**
- Use SQLite FTS5 for full-text search
- For attachments, create `attachments` table with file metadata
- Rich text stored as JSON (TipTap format) or HTML

---

### 1.3 YouTube Analytics Tracking
**Priority: High**

- [ ] Create `video_snapshots` table
  - `video_id`, `snapshot_date`, `views`, `likes`, `comments`, `watch_time`
  - Store daily snapshots for trend analysis
- [ ] Implement scheduled YouTube sync job
  - Replace placeholder in `scheduler.py`
  - Fetch analytics for user's linked videos
  - Run daily (configurable frequency)
- [ ] Video performance dashboard
  - Show views/likes/comments over time (line charts)
  - Compare videos side-by-side
  - Highlight best/worst performers
- [ ] Link entries to video performance
  - When creating entry for a video, show its current metrics
  - Update metrics automatically via background job
- [ ] Notification system for milestones
  - "Your video hit 10K views!"
  - "Your channel gained 1K subs this week"

**Technical Notes:**
- Use YouTube Analytics API (requires separate OAuth scope)
- Store aggregated data at video and channel level
- Consider rate limits (10,000 quota units/day)

---

### 1.4 Growth Score Improvements
**Priority: Medium**

- [ ] Define growth score algorithm
  - Factors: subscriber growth, avg views, engagement rate, upload consistency
  - Weighted formula with configurable parameters
- [ ] Implement `GrowthScoreService` (currently placeholder)
  - Calculate score from video snapshots
  - Store historical scores in `growth_scores` table
- [ ] Enhanced score visualization
  - Show score breakdown (what contributes to score)
  - Compare to previous periods
  - Show projected score if current trends continue
- [ ] Goal setting
  - User sets target score or metrics
  - Show progress toward goals
  - Suggest actions to reach goals

**Technical Notes:**
- Store score components separately for transparency
- Use percentile-based scoring relative to channel size
- Update score daily via scheduled job

---

### 1.5 UI/UX Polish
**Priority: Medium**

- [ ] Dark mode support
  - Leverage existing HSL color tokens
  - Add theme toggle in navbar
  - Persist preference in localStorage
- [ ] Responsive improvements
  - Optimize mobile layouts
  - Add gesture support (swipe to delete, pull to refresh)
- [ ] Keyboard shortcuts
  - `Ctrl+K` for command palette
  - `N` for new entry
  - `?` for help menu
- [ ] Empty states and onboarding
  - Guide new users through first steps
  - Show sample data or tutorial
- [ ] Loading states and optimistic updates
  - Skeleton loaders for async content
  - Optimistic UI for mutations (React Query)

---

## Phase 2: AI Agent & Advanced Analytics (Medium-Term)
**Timeline: 2-4 months**

### 2.1 AI-Powered Insights Agent
**Priority: Critical**

This is the game-changer: an AI assistant that knows your channel deeply and can answer complex questions.

#### Core Capabilities
- [ ] Conversational interface
  - Chat widget in bottom-right corner (or dedicated page)
  - Context-aware responses based on user's data
  - Natural language queries like:
    - "Why did my last video underperform?"
    - "What topics should I cover next?"
    - "Compare my Q1 vs Q2 performance"
- [ ] Memory system
  - Store conversation history in `agent_conversations` table
  - Remember insights and preferences across sessions
  - User can save important insights as entries
- [ ] YouTube API access
  - Agent can fetch real-time data during conversation
  - Analyze video performance, audience demographics, traffic sources
  - Compare against channel benchmarks
- [ ] Data analysis capabilities
  - Generate charts and visualizations inline
  - Perform statistical analysis (correlation, trends)
  - Suggest A/B test ideas

#### Technical Implementation
- [ ] Create `/chat` WebSocket endpoint
  - Streaming responses for better UX
  - Handle multi-turn conversations
- [ ] Integrate OpenAI API (already configured)
  - Use GPT-4 for reasoning
  - Function calling for YouTube API queries
  - Structured outputs for insights
- [ ] Build tool system for agent
  - `fetch_video_stats(video_id)`
  - `get_audience_demographics()`
  - `compare_videos(video_ids)`
  - `search_entries(query)`
  - `create_entry(data)`
- [ ] Implement RAG (Retrieval-Augmented Generation)
  - Embed all entries using OpenAI embeddings
  - Store vectors in SQLite (with `sqlite-vss` extension)
  - Retrieve relevant context for each query
- [ ] Add insight tracking
  - User can mark insights as "tracked"
  - Agent proactively checks tracked insights
  - Example: "Track whether posting at 3pm improves engagement"

#### UI Components
- [ ] Chat interface with markdown rendering
- [ ] Code/chart rendering in responses
- [ ] "Save as entry" button for important insights
- [ ] Insight sidebar showing active tracked insights
- [ ] Agent "thinking" indicator for complex queries

**Technical Stack:**
- OpenAI GPT-4 (via `openai` Python library)
- WebSockets (FastAPI supports via `python-socketio`)
- `sqlite-vss` for vector search
- TipTap for chat message rendering
- Recharts for inline visualizations

---

### 2.2 Advanced Analytics Dashboard
**Priority: High**

Go beyond basic charts to provide actionable intelligence.

- [ ] Audience insights
  - Demographics (age, gender, location)
  - Watch time by device and traffic source
  - Subscriber vs non-subscriber breakdown
- [ ] Content performance matrix
  - Heatmap of video types × topics × performance
  - Identify winning combinations
- [ ] Trend detection
  - Automatic detection of significant changes
  - Alert user to anomalies (sudden spike/drop)
- [ ] Competitor analysis (optional)
  - User adds competitor channels
  - Compare growth rates and content strategies
- [ ] Custom reports
  - User defines custom metrics and time ranges
  - Export to PDF or CSV

---

### 2.3 Predictive Analytics
**Priority: Medium**

Use historical data to forecast future performance.

- [ ] View count prediction
  - Estimate first 24hr/7day/30day views for new video
  - Based on title, thumbnail, topic, upload time
- [ ] Optimal upload time recommendation
  - Analyze historical performance by day/time
  - Suggest best times for max engagement
- [ ] Topic trend forecasting
  - Identify rising topics in niche
  - Suggest topics to cover before they peak

**Technical Notes:**
- Use scikit-learn for basic ML models
- Consider external data (Google Trends API)
- Start simple (regression models) before deep learning

---

## Phase 3: Content Production Suite (Medium-Term)
**Timeline: 3-5 months**

### 3.1 Idea Management System
**Priority: High**

Help creators capture, develop, and prioritize content ideas.

- [ ] Idea bank
  - Create `ideas` table with `title`, `description`, `status`, `priority`
  - Statuses: "raw", "exploring", "ready", "in_production", "published"
- [ ] Idea canvas
  - Visual board to explore ideas (Kanban or mind map)
  - Drag-and-drop to change status
  - Group by topic, priority, or target date
- [ ] AI-assisted idea development
  - Chat with agent about an idea
  - Generate hooks, titles, angles
  - Research similar videos for inspiration
- [ ] Idea scoring
  - Estimate potential views based on topic, competition
  - Rank ideas by score
- [ ] Convert idea to script
  - One-click transition from idea → script editor
  - Pre-filled template with sections

**UI Mockup:**
```
┌─────────────────────────────────────────────┐
│ Idea Bank                          [+ New]  │
├─────────────────────────────────────────────┤
│ Raw Ideas (12)                              │
│ ┌─────────────────┐ ┌─────────────────┐    │
│ │ 10 Tools for... │ │ Behind Scenes..  │    │
│ │ ⭐ High Priority │ │ ⭐ Medium        │    │
│ └─────────────────┘ └─────────────────┘    │
│                                             │
│ Exploring (3)                               │
│ ┌─────────────────┐                        │
│ │ Vim Tutorial... │ [Chat][Script]         │
│ │ Research: 73%   │                        │
│ └─────────────────┘                        │
└─────────────────────────────────────────────┘
```

---

### 3.2 Script Editor
**Priority: High**

A dedicated space to write, iterate, and refine video scripts.

- [ ] Script document model
  - `scripts` table linked to ideas and videos
  - Version history (track changes over time)
- [ ] Rich text editor with script-specific features
  - Sections: Hook, Intro, Body, CTA, Outro
  - Timecode markers
  - Speaker notes vs on-screen text
- [ ] AI writing assistant
  - Suggest improvements to hook
  - Expand bullet points into full paragraphs
  - Rephrase for clarity or energy
- [ ] Script templates
  - "Tutorial", "Product Review", "Listicle", "Vlog"
  - Customizable by user
- [ ] Export options
  - PDF for teleprompter
  - Plain text for editing in other tools
  - JSON for programmatic use

---

### 3.3 Clip Canvas
**Priority: Medium**

Visual tool to plan video structure and clip assembly.

- [ ] Timeline-based canvas
  - Drag-and-drop clips onto timeline
  - Represent clips as cards with thumbnail + duration
- [ ] Clip library integration
  - Browse b-roll, segments from library
  - Preview before adding to timeline
- [ ] Scene planning
  - Define scenes: intro, main content, transitions, outro
  - Attach notes to each scene
- [ ] Storyboard view
  - Visual representation of entire video
  - Rearrange scenes easily
- [ ] Export storyboard
  - Share with editor
  - Generate editing notes

**Visual Concept:**
```
┌────────────────────────────────────────────────────────┐
│ Clip Canvas: "10 Vim Tips"                   [Export] │
├────────────────────────────────────────────────────────┤
│ Timeline (0:00 → 12:30)                               │
│ ┌──────┐┌──────────┐┌─────┐┌──────────────┐┌─────┐  │
│ │Hook  ││Intro     ││Tip 1││B-roll (desk) ││Tip 2│  │
│ │0:15  ││0:45      ││1:20 ││0:30          ││1:30 │  │
│ └──────┘└──────────┘└─────┘└──────────────┘└─────┘  │
│                                                       │
│ Library                                               │
│ ┌───────┐ ┌───────┐ ┌───────┐                        │
│ │B-roll │ │Outro  │ │CTA    │                        │
│ │Coffee │ │Templt │ │Templt │                        │
│ └───────┘ └───────┘ └───────┘                        │
└────────────────────────────────────────────────────────┘
```

---

### 3.4 Asset Library
**Priority: High**

Organize and reuse b-roll, intros, outros, music, graphics.

- [ ] File upload and storage
  - Support video clips, images, audio
  - Store metadata: filename, duration, tags, notes
- [ ] Tagging and categorization
  - Tag assets by topic, mood, style
  - Create collections (e.g., "Workspace B-roll", "Tech Graphics")
- [ ] Auto-segmentation (AI-powered)
  - Upload long video, AI splits into segments
  - Tag segments by topic automatically
  - Example: Upload 1hr of desk shots → 20 tagged clips
- [ ] Preview and search
  - Thumbnail previews
  - Search by filename, tags, or visual similarity
- [ ] Usage tracking
  - See which assets are used most
  - Mark assets as "overused" to encourage variety
- [ ] Integration with clip canvas
  - Drag assets directly onto timeline

**Technical Notes:**
- Use cloud storage (S3, R2, or local filesystem)
- For auto-segmentation: use OpenAI Vision or open-source models (PySceneDetect)
- For tagging: CLIP embeddings for visual search

---

### 3.5 Content Calendar
**Priority: Medium**

Plan and schedule content strategically.

- [ ] Calendar view
  - Month/week view with entries, ideas, videos
  - Drag to reschedule
- [ ] Publishing schedule
  - Set target publish dates for ideas/scripts
  - See gaps in schedule
- [ ] Reminders and deadlines
  - Email or in-app notifications
- [ ] Cross-platform planning (future)
  - Plan YouTube, TikTok, Instagram together
  - Repurpose content across platforms

---

## Phase 4: Creator-Sponsor Network (Long-Term)
**Timeline: 6-12 months**

This is the bold, ecosystem-level vision: connect creators with sponsors based on data-driven matching.

### 4.1 Creator Profile & Scoring
**Priority: Critical for network**

- [ ] Public creator profile
  - Showcase channel stats, growth trajectory
  - Highlight content themes and audience demographics
  - Display "Storyloop Score" (credibility metric)
- [ ] Enhanced scoring algorithm
  - Factors: engagement rate, audience quality, content consistency, niche authority
  - Weighted differently for sponsors (vs creator's internal score)
- [ ] Audience insights for sponsors
  - Demographics, interests, purchasing behavior (if available)
  - Engagement metrics (not just vanity metrics)
- [ ] Verification badges
  - Verified email, YouTube channel, revenue milestones
- [ ] Portfolio section
  - Showcase best videos, case studies, past sponsorships

---

### 4.2 Sponsor Platform
**Priority: Critical for network**

- [ ] Sponsor account type
  - Separate signup flow for brands/agencies
  - `sponsor_profiles` table with company info, industry
- [ ] Search and discovery
  - Search creators by:
    - Theme/niche (tech, gaming, lifestyle, etc.)
    - Audience size and demographics
    - Storyloop Score range
    - Budget range
  - Filters: location, language, engagement rate
- [ ] Creator recommendations
  - AI-powered matching algorithm
  - Suggest creators that fit brand's target audience
- [ ] Outreach tools
  - Message creators directly (with spam protection)
  - Send collaboration proposals
- [ ] Campaign management
  - Track active sponsorships
  - View performance reports (views, clicks, conversions)

---

### 4.3 Matching & Discovery Engine
**Priority: High**

- [ ] Define matching criteria
  - Creators: themes, audience, engagement
  - Sponsors: industry, target demo, budget
- [ ] Recommendation algorithm
  - Collaborative filtering (similar creators/sponsors)
  - Content analysis (match themes to brand)
  - Engagement prediction
- [ ] Discovery feed
  - Creators see relevant sponsor opportunities
  - Sponsors see suggested creators
- [ ] Bidding system (optional)
  - Sponsors post campaigns, creators apply
  - Creators set their rates

---

### 4.4 Transaction & Payment System
**Priority: High**

- [ ] Escrow system
  - Sponsor deposits funds
  - Released after creator delivers
- [ ] Payment processing
  - Integrate Stripe or PayPal
  - Handle fees (platform takes 5-10%)
- [ ] Invoicing
  - Auto-generate invoices
  - Track payment history
- [ ] Compliance
  - Tax reporting (1099 forms for US creators)
  - Contract templates

---

### 4.5 Review & Reputation System
**Priority: Medium**

- [ ] Reviews
  - Sponsors review creators (professionalism, quality)
  - Creators review sponsors (payment speed, communication)
- [ ] Reputation scores
  - Factor reviews into matching algorithm
  - Highlight top-rated creators/sponsors
- [ ] Dispute resolution
  - Mediation process for issues
  - Platform arbitration

---

### 4.6 Analytics for Sponsors
**Priority: Medium**

- [ ] Campaign performance dashboard
  - Views, clicks, conversions per creator
  - ROI calculation
- [ ] Attribution tracking
  - Unique promo codes or links per creator
  - Track sales/signups from each sponsorship
- [ ] Comparative analysis
  - Compare multiple creators in same campaign
  - Identify best performers

---

## Technical Architecture Evolution

### Phase 1 Architecture
```
┌──────────────────────────────────────────────────────┐
│ Frontend (React + TanStack Query)                    │
│ - Auth UI, Entry CRUD, YouTube integration          │
└───────────────────┬──────────────────────────────────┘
                    │ REST API
┌───────────────────▼──────────────────────────────────┐
│ Backend (FastAPI)                                    │
│ - Auth, Entries, YouTube, Scheduler                  │
│ - SQLite database                                    │
└──────────────────────────────────────────────────────┘
```

### Phase 2 Architecture (+ AI Agent)
```
┌──────────────────────────────────────────────────────┐
│ Frontend                                             │
│ - Chat UI, Rich text editor                          │
└───────────┬────────────────┬─────────────────────────┘
            │ REST            │ WebSocket
┌───────────▼────────────────▼─────────────────────────┐
│ Backend                                              │
│ - Chat endpoint (WebSocket)                          │
│ - OpenAI integration                                 │
│ - Vector search (sqlite-vss)                         │
│ - Background jobs (analytics sync)                   │
└──────────────────────────────────────────────────────┘
```

### Phase 3 Architecture (+ Content Suite)
```
┌──────────────────────────────────────────────────────┐
│ Frontend                                             │
│ - Script editor, Clip canvas, Asset browser          │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│ Backend                                              │
│ - File upload API                                    │
│ - AI segmentation service                            │
│ - Asset management                                   │
└────────────┬─────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────┐
│ Storage (S3/R2 or local)                             │
│ - Video clips, images, audio                         │
└──────────────────────────────────────────────────────┘
```

### Phase 4 Architecture (+ Network)
```
┌──────────────────────────────────────────────────────┐
│ Frontend                                             │
│ - Creator profiles, Sponsor dashboard, Messaging     │
└───────────────────┬──────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────┐
│ Backend                                              │
│ - Matching algorithm                                 │
│ - Messaging/notifications                            │
│ - Payment processing                                 │
└────────────┬───────────────┬─────────────────────────┘
             │               │
┌────────────▼────┐  ┌───────▼──────────────────────────┐
│ PostgreSQL      │  │ External Services                │
│ (migrate from   │  │ - Stripe (payments)              │
│  SQLite for     │  │ - SendGrid (emails)              │
│  multi-tenancy) │  │ - YouTube Analytics API          │
└─────────────────┘  └──────────────────────────────────┘
```

---

## Success Metrics

### Phase 1 Metrics
- **User Growth**: 100 active users in first 3 months
- **Engagement**: 70% of users return weekly
- **Feature Adoption**: 50% of users create entries at least 3x/week

### Phase 2 Metrics
- **AI Agent Usage**: 40% of users chat with agent weekly
- **Insight Tracking**: Average 3 tracked insights per user
- **Retention**: Agent users have 2x retention vs non-users

### Phase 3 Metrics
- **Content Creation**: 60% of users use idea bank or scripts
- **Asset Library**: Average 20 assets per active user
- **Productivity**: Users report 30% faster video planning

### Phase 4 Metrics
- **Network Growth**: 500 creators, 50 sponsors in first 6 months
- **Match Success**: 20% of creator-sponsor matches result in deals
- **GMV (Gross Merchandise Value)**: $100K in sponsorship deals in Year 1
- **Retention**: 80% of creators who complete a deal return for more

---

## Prioritization Framework

When deciding what to build next, use these criteria:

1. **User Impact**: Does this solve a critical pain point?
2. **Differentiation**: Does this set us apart from competitors?
3. **Monetization**: Does this enable revenue?
4. **Technical Risk**: Can we build this reliably?
5. **Effort vs Value**: What's the ROI?

### Key Dependencies
- **AI Agent** depends on → Authentication (user context)
- **Sponsor Network** depends on → Enhanced scoring + Analytics
- **Clip Canvas** depends on → Asset Library
- **Content Calendar** depends on → Ideas + Scripts

---

## Technologies to Consider

### Phase 2
- **Vector DB**: `sqlite-vss` or upgrade to `pgvector` (if move to Postgres)
- **WebSockets**: FastAPI native support or `python-socketio`
- **Embeddings**: OpenAI `text-embedding-3-small` or Cohere

### Phase 3
- **Video Processing**: FFmpeg (via `ffmpeg-python`), PySceneDetect
- **Visual Search**: CLIP model (OpenAI or open-source)
- **Storage**: AWS S3, Cloudflare R2, or Backblaze B2

### Phase 4
- **Database**: Migrate to PostgreSQL for better multi-tenancy
- **Payments**: Stripe Connect (for marketplace)
- **Messaging**: Stream.io or custom WebSocket solution
- **ML Matching**: scikit-learn, LightGBM, or simple heuristic-based

---

## Open Questions

1. **Monetization Strategy**
   - Freemium (free basic, paid AI + network)?
   - Subscription tiers?
   - Transaction fees on sponsorships?

2. **Data Privacy**
   - How do we handle YouTube data (ToS compliance)?
   - What creator data is visible to sponsors?

3. **Competitive Moat**
   - How do we prevent competitors from replicating features?
   - What's our unique defensibility?

4. **Scale**
   - At what user count do we need to migrate from SQLite?
   - When do we need dedicated infrastructure (Redis, queues)?

5. **Content Moderation**
   - Do we need to review creator profiles?
   - How do we prevent spam/abuse in sponsor network?

---

## Next Steps

1. **Review and Prioritize**: Go through this roadmap and decide Phase 1 priorities
2. **Set Milestones**: Break Phase 1 into 2-week sprints
3. **Prototype AI Agent**: Build a proof-of-concept chat interface to validate technical approach
4. **User Research**: Interview potential users to validate assumptions
5. **Design Mockups**: Create UI mockups for key features (agent, library, network)

---

**Last Updated**: 2025-11-04
**Version**: 1.0
